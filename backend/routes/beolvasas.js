// a dolgozó beolvassa a felhasználó QR Kódját.

// =====================================================================
//  routes/beolvasas.js – QR beolvasás a látványosság bejáratánál
//                        (dolgozo)
//
//  GET  /api/beolvasas/qr/:qrToken   bérlet adatai + érvényes-e most itt (nem naplóz)
//  POST /api/beolvasas               BELÉPÉS: új sor a beolvasas_naplozas táblába
//  PUT  /api/beolvasas/kilepes       KILÉPÉS: a nyitott belépés sorába kilepes_ideje kerül
//  GET  /api/beolvasas               a látványosság mai naplója (?datum=2026-10-28)
//
//  A látványosság a beolvasó SAJÁT aktív beosztásából jön. Ha több aktív
//  beosztása van, a latvanyossag_id-t is meg kell adni (body / query).
//
//  Belépés szabályai (ha bármelyik nem teljesül → 'elutasitva' + elutasitas_oka):
//   - a birtokos még tagja (vagy vezetője) a csoportnak, a csoport nem törölt
//   - ervenyes_kezdet <= most <= ervenyes_vege
//   - a bérlet tartalmaz területet ennél a látványosságnál
//   - a látványosság most nincs zárva (zarva_tartas, nyitvatartas)
//   - a birtokos nincs már bent (nincs MAI kilépés nélküli elfogadott belépése itt)
//  Minden beolvasás naplózódik, az elutasított is. Egy ember többször is
//  ki-be léphet: belépésenként új sor, a kilépés ugyanazt a sort módosítja.
// =====================================================================
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");

const router = express.Router();
router.use(auth, authorize("dolgozo"));

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

// A beolvasó aktív beosztása. Hibánál { status, error }.
async function beosztasKeres(felhasznaloId, latvanyossagId) {
  const [sorok] = await pool.query(
    `SELECT b.beosztas_id, b.latvanyossag_id, l.megnevezes AS latvanyossag
       FROM beosztas b
       JOIN latvanyossag l ON l.latvanyossag_id = b.latvanyossag_id
      WHERE b.felhasznalo_id = ? AND b.kilepett_datum IS NULL`,
    [felhasznaloId]
  );

  if (latvanyossagId) {
    const talalt = sorok.find((s) => s.latvanyossag_id === Number(latvanyossagId));
    return talalt || { status: 403, error: "Nincs aktív beosztásod ennél a látványosságnál" };
  }
  if (!sorok.length) return { status: 403, error: "Nincs aktív beosztásod" };
  if (sorok.length > 1) {
    return {
      status: 400,
      error: "Több látványossághoz is be vagy osztva, add meg a latvanyossag_id-t",
      latvanyossagok: sorok.map((s) => ({ latvanyossag_id: s.latvanyossag_id, megnevezes: s.latvanyossag })),
    };
  }
  return sorok[0];
}

// A QR tokenhez tartozó bérlet és birtokos (vagy undefined)
async function berletKeres(db, qrToken, zarolas = false) {
  const [sorok] = await db.query(
    `SELECT fb.felhasznalo_berlet_id, fb.felhasznalo_id,
            f.vezeteknev, f.keresztnev, f.foto_url, f.preferalt_kedvezmeny,
            b.berlet_id, b.ervenyes_kezdet, b.ervenyes_vege,
            DATE_FORMAT(b.ervenyes_kezdet, '%Y-%m-%d %H:%i') AS kezdet_szoveg,
            DATE_FORMAT(b.ervenyes_vege,   '%Y-%m-%d %H:%i') AS vege_szoveg,
            NOW() < b.ervenyes_kezdet AS meg_nem_ervenyes,
            NOW() > b.ervenyes_vege   AS lejart,
            r.rendeles_id, c.csoport_id, c.csoport_nev,
            (c.allapot <> 'torolt' AND (
               c.vezeto_felhasznalo_id = fb.felhasznalo_id
               OR EXISTS (SELECT 1 FROM csoport_tagok t
                           WHERE t.csoport_id = c.csoport_id
                             AND t.felhasznalo_id = fb.felhasznalo_id
                             AND t.tag_allapot = 'aktiv'))) AS meg_tag
       FROM felhasznalo_berlet fb
       JOIN felhasznalo f ON f.felhasznalo_id = fb.felhasznalo_id
       JOIN berlet   b    ON b.berlet_id      = fb.berlet_id
       JOIN rendeles r    ON r.rendeles_id    = b.rendeles_id
       JOIN csoport  c    ON c.csoport_id     = r.csoport_id
      WHERE fb.qr_token = ?
      ${zarolas ? "FOR UPDATE" : ""}`,
    [qrToken]
  );
  return sorok[0];
}

// A bérlet területei ennél a látványosságnál
async function teruletekItt(db, rendelesId, latvanyossagId) {
  const [sorok] = await db.query(
    `SELECT t.terulet_id, t.terulet_megnevezes
       FROM rendeles_teruletei rt
       JOIN latvanyossag_terulet t ON t.terulet_id = rt.terulet_id
      WHERE rt.rendeles_id = ? AND t.latvanyossag_id = ?
      ORDER BY t.terulet_megnevezes`,
    [rendelesId, latvanyossagId]
  );
  return sorok;
}

// A birtokos MAI nyitott (kilépés nélküli, elfogadott) belépése itt, vagy undefined.
// Egy korábbi napon elfelejtett kilépés nem zárja ki a mai belépést.
async function nyitottBelepes(db, felhasznaloBerletId, latvanyossagId) {
  const [sorok] = await db.query(
    `SELECT naplo_id, belepes_ideje FROM beolvasas_naplozas
      WHERE felhasznalo_berlet_id = ? AND latvanyossag_id = ?
        AND validalas_eredmeny_QR = 'elfogadva' AND kilepes_ideje IS NULL
        AND belepes_ideje >= CURDATE()
      ORDER BY belepes_ideje DESC LIMIT 1`,
    [felhasznaloBerletId, latvanyossagId]
  );
  return sorok[0];
}

// Zárva van-e most a látványosság? Az ok szövege, vagy null.
async function zarvaOka(db, latvanyossagId) {
  const [zarva] = await db.query(
    `SELECT indok FROM zarva_tartas
      WHERE latvanyossag_id = ? AND NOW() BETWEEN kezdo_datum AND vege_datum LIMIT 1`,
    [latvanyossagId]
  );
  if (zarva.length) return `A látványosság ideiglenesen zárva${zarva[0].indok ? ` (${zarva[0].indok})` : ""}.`;

  // WEEKDAY(): 0 = hétfő. Ha a napra nincs adat, nem tiltunk.
  const [nap] = await db.query(
    `SELECT allapot, kezdet_ora, vege_ora,
            CURTIME() BETWEEN kezdet_ora AND vege_ora AS nyitva_most
       FROM nyitvatartas
      WHERE latvanyossag_id = ?
        AND nap_neve = ELT(WEEKDAY(NOW()) + 1, 'Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat','Vasárnap')`,
    [latvanyossagId]
  );
  if (!nap.length) return null;
  if (nap[0].allapot === "zárva") return "A látványosság ma zárva tart.";
  if (nap[0].kezdet_ora && nap[0].vege_ora && !nap[0].nyitva_most) {
    return `A látványosság most zárva (nyitvatartás: ${nap[0].kezdet_ora.slice(0, 5)}–${nap[0].vege_ora.slice(0, 5)}).`;
  }
  return null;
}

// Az ellenőrzés: az elutasítás oka, vagy null, ha beléphet
async function elutasitasOka(db, berlet, latvanyossagId) {
  if (!berlet.meg_tag) return "A bérlet birtokosa már nem tagja a csoportnak, a bérlet nem használható.";
  if (berlet.meg_nem_ervenyes) return `A bérlet még nem érvényes (érvényesség kezdete: ${berlet.kezdet_szoveg}).`;
  if (berlet.lejart) return `A bérlet érvényessége lejárt (érvényes volt: ${berlet.vege_szoveg}).`;
  if (!(await teruletekItt(db, berlet.rendeles_id, latvanyossagId)).length) {
    return "A bérlet nem érvényes erre a látványosságra.";
  }
  const zarva = await zarvaOka(db, latvanyossagId);
  if (zarva) return zarva;
  if (await nyitottBelepes(db, berlet.felhasznalo_berlet_id, latvanyossagId)) {
    return "A bérlettel a belépés már megtörtént, előbb ki kell lépni.";
  }
  return null;
}

// ---------- QR ELLENŐRZÉS (nem naplóz) ----------
// A dolgozó beszkenneli a kódot → látja a bérlet adatait és hogy beléphet-e,
// vagy (ha bent van) kiléptetheti. ?latvanyossag_id= ha több beosztása van.
router.get("/qr/:qrToken", async (req, res) => {
  try {
    const beosztas = await beosztasKeres(req.user.id, req.query.latvanyossag_id);
    if (beosztas.error) return res.status(beosztas.status).json({ error: beosztas.error, latvanyossagok: beosztas.latvanyossagok });

    const berlet = await berletKeres(pool, req.params.qrToken);
    if (!berlet) return res.status(404).json({ error: "Ismeretlen QR kód" });

    const bent = await nyitottBelepes(pool, berlet.felhasznalo_berlet_id, beosztas.latvanyossag_id);
    const oka = bent ? null : await elutasitasOka(pool, berlet, beosztas.latvanyossag_id);

    res.json({
      latvanyossag_id: beosztas.latvanyossag_id,
      latvanyossag: beosztas.latvanyossag,
      birtokos: {
        felhasznalo_id: berlet.felhasznalo_id,
        vezeteknev: berlet.vezeteknev,
        keresztnev: berlet.keresztnev,
        foto_url: berlet.foto_url,
        kedvezmeny: berlet.preferalt_kedvezmeny || "Felnőtt",
      },
      berlet: {
        berlet_id: berlet.berlet_id,
        csoport_nev: berlet.csoport_nev,
        ervenyes_kezdet: berlet.ervenyes_kezdet,
        ervenyes_vege: berlet.ervenyes_vege,
      },
      teruletek: await teruletekItt(pool, berlet.rendeles_id, beosztas.latvanyossag_id),
      // mi a következő lépés: 'kilepes' (bent van), 'belepes' (beléphet), 'elutasitva'
      kovetkezo: bent ? "kilepes" : oka ? "elutasitva" : "belepes",
      bent_naplo_id: bent ? bent.naplo_id : null,
      elutasitas_oka: oka,
    });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- BELÉPÉS: a beolvasás rögzítése ----------
// Body: { qr_token, latvanyossag_id? }
// Mindig naplóz (201): eredmeny = 'elfogadva' | 'elutasitva' (+ elutasitas_oka)
router.post("/", async (req, res) => {
  try {
    const { qr_token, latvanyossag_id } = req.body || {};
    if (!qr_token) return res.status(400).json({ error: "Hiányzó QR token" });

    const beosztas = await beosztasKeres(req.user.id, latvanyossag_id);
    if (beosztas.error) return res.status(beosztas.status).json({ error: beosztas.error, latvanyossagok: beosztas.latvanyossagok });

    const kapcsolat = await pool.getConnection();
    try {
      await kapcsolat.beginTransaction();

      // Zárolás: két egyszerre érkező beolvasás ne hozzon létre két nyitott belépést
      const berlet = await berletKeres(kapcsolat, qr_token, true);
      if (!berlet) {
        await kapcsolat.rollback();
        return res.status(404).json({ error: "Ismeretlen QR kód" });
      }

      const oka = await elutasitasOka(kapcsolat, berlet, beosztas.latvanyossag_id);
      const eredmeny = oka ? "elutasitva" : "elfogadva";

      const [uj] = await kapcsolat.query(
        `INSERT INTO beolvasas_naplozas
           (felhasznalo_berlet_id, latvanyossag_id, validalas_eredmeny_QR, beosztas_id, elutasitas_oka)
         VALUES (?, ?, ?, ?, ?)`,
        [berlet.felhasznalo_berlet_id, beosztas.latvanyossag_id, eredmeny, beosztas.beosztas_id, oka]
      );

      await kapcsolat.commit();
      res.status(201).json({
        naplo_id: uj.insertId,
        eredmeny,
        elutasitas_oka: oka,
        birtokos: `${berlet.vezeteknev} ${berlet.keresztnev}`,
        latvanyossag: beosztas.latvanyossag,
      });
    } catch (err) {
      await kapcsolat.rollback();
      throw err;
    } finally {
      kapcsolat.release();
    }
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- KILÉPÉS: ugyanannak a sornak a módosítása ----------
// Body: { qr_token, latvanyossag_id? }
// A legutóbbi, még nyitott elfogadott belépés kap kilepes_ideje-t.
router.put("/kilepes", async (req, res) => {
  try {
    const { qr_token, latvanyossag_id } = req.body || {};
    if (!qr_token) return res.status(400).json({ error: "Hiányzó QR token" });

    const beosztas = await beosztasKeres(req.user.id, latvanyossag_id);
    if (beosztas.error) return res.status(beosztas.status).json({ error: beosztas.error, latvanyossagok: beosztas.latvanyossagok });

    const berlet = await berletKeres(pool, qr_token);
    if (!berlet) return res.status(404).json({ error: "Ismeretlen QR kód" });

    const bent = await nyitottBelepes(pool, berlet.felhasznalo_berlet_id, beosztas.latvanyossag_id);
    if (!bent) return res.status(409).json({ error: "Nincs nyitott belépés, a látogató nincs bent" });

    // a kilepes_ideje IS NULL feltétel miatt két egyszerre érkező kilépés sem írja felül egymást
    const [frissites] = await pool.query(
      "UPDATE beolvasas_naplozas SET kilepes_ideje = NOW() WHERE naplo_id = ? AND kilepes_ideje IS NULL",
      [bent.naplo_id]
    );
    if (!frissites.affectedRows) return res.status(409).json({ error: "A kilépés már rögzítve van" });

    res.json({
      naplo_id: bent.naplo_id,
      birtokos: `${berlet.vezeteknev} ${berlet.keresztnev}`,
      belepes_ideje: bent.belepes_ideje,
      message: "Kilépés rögzítve",
    });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// Érvényes ÉÉÉÉ-HH-NN dátum-e (pl. "2026-10-28")? A nem létező napot is kiszűri (pl. 2026-02-31).
function joDatum(szoveg) {
  if (typeof szoveg !== "string") return false; // ?datum=a&datum=b esetén tömb jönne

  const reszek = szoveg.split("-");
  if (reszek.length !== 3) return false;
  if (reszek[0].length !== 4 || reszek[1].length !== 2 || reszek[2].length !== 2) return false;

  // minden karakter számjegy legyen
  for (const resz of reszek) {
    for (const karakter of resz) {
      if (karakter < "0" || karakter > "9") return false;
    }
  }

  // létező nap-e: ha a Date "átcsúszik" (pl. 02-31 → 03-03), akkor nem
  const [ev, ho, nap] = reszek.map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap));
  return d.getUTCFullYear() === ev && d.getUTCMonth() === ho - 1 && d.getUTCDate() === nap;
}

// ---------- A LÁTVÁNYOSSÁG NAPLÓJA ----------
// ?datum=2026-10-28 (alap: ma), ?latvanyossag_id= ha több beosztása van
router.get("/", async (req, res) => {
  try {
    const beosztas = await beosztasKeres(req.user.id, req.query.latvanyossag_id);
    if (beosztas.error) return res.status(beosztas.status).json({ error: beosztas.error, latvanyossagok: beosztas.latvanyossagok });

    const datum = req.query.datum;
    if (datum !== undefined && !joDatum(datum)) {
      return res.status(400).json({ error: "Hibás dátum (ÉÉÉÉ-HH-NN)" });
    }

    const [sorok] = await pool.query(
      `SELECT n.naplo_id, n.belepes_ideje, n.kilepes_ideje, n.validalas_eredmeny_QR, n.elutasitas_oka,
              f.vezeteknev, f.keresztnev, fb.berlet_id,
              d.vezeteknev AS dolgozo_vezeteknev, d.keresztnev AS dolgozo_keresztnev
         FROM beolvasas_naplozas n
         JOIN felhasznalo_berlet fb ON fb.felhasznalo_berlet_id = n.felhasznalo_berlet_id
         JOIN felhasznalo f         ON f.felhasznalo_id         = fb.felhasznalo_id
         JOIN beosztas bo           ON bo.beosztas_id           = n.beosztas_id
         LEFT JOIN felhasznalo d    ON d.felhasznalo_id         = bo.felhasznalo_id
        WHERE n.latvanyossag_id = ? AND DATE(n.belepes_ideje) = COALESCE(?, CURDATE())
        ORDER BY n.belepes_ideje DESC`,
      [beosztas.latvanyossag_id, datum || null]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

module.exports = router;
