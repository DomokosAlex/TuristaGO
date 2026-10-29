// A csoportl indul ki, a csoport hoz tartozó kifizetés után létrehozza a csoporthoz tartozó bérleteket. 
// és kezeli ki van benne ki a vezetője. 
//csak a vezető indithatja el a megvásárlást. 
// minden felhasználónak saját a QR kódja de csoporton belül mind ugyanarra  abérletre hivatkoznak.

//A bérlet  mely látványosság és területen vannak meg

// =====================================================================
//  routes/berlet.js – Csoportos bérletek (turista)
//
//  POST /api/berlet          bérlet létrehozása egy kifizetett rendelésből (csak a vezető)
//  GET  /api/berlet          saját bérleteim
//  GET  /api/berlet/:id      bérlet részletei: látványosságok, területek (+ birtokosok a vezetőnek)
//  GET  /api/berlet/:id/qr   saját QR token (csak ha még használható)
//
//  Szabályok:
//   - Rendelésenként EGY bérlet; a csoport minden tagja ugyanarra hivatkozik,
//     de mindenkinek saját QR tokenje van (felhasznalo_berlet).
//   - Bérletet a létrehozás pillanatában a vezető és az AKKOR aktív tagok kapnak.
//     Aki később csatlakozik, nem kap.
//   - Aki kilép, a sora megmarad, de a bérletet nem használhatja.
//   - Az állapot (inaktiv / aktiv / lejart) a dátumokból frissül minden lekérdezéskor.
//
//  A berletLetrehozas() függvényt a rendeles_fizetes.js is használhatja sikeres fizetés után.
// =====================================================================
const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");

const router = express.Router();
router.use(auth, authorize("turista"));

// Igaz, ha a bérlet birtokosa (fb.felhasznalo_id) még a csoport vezetője vagy aktív tagja
const MEG_TAG_SQL = `
  (c.allapot <> 'torolt' AND (
     c.vezeto_felhasznalo_id = fb.felhasznalo_id
     OR EXISTS (SELECT 1 FROM csoport_tagok t
                 WHERE t.csoport_id = c.csoport_id
                   AND t.felhasznalo_id = fb.felhasznalo_id
                   AND t.tag_allapot = 'aktiv')))`;

// Az állapotok frissítése a dátumok alapján
async function allapotFrissites() {
  await pool.query(
    `UPDATE berlet
        SET allapot = CASE
              WHEN NOW() > ervenyes_vege    THEN 'lejart'
              WHEN NOW() >= ervenyes_kezdet THEN 'aktiv'
              ELSE 'inaktiv' END
      WHERE allapot <> 'lejart'`
  );
}

// ---------------------------------------------------------------------
//  Bérlet + QR tokenek létrehozása egy tranzakcióban.
//  A vezető és a csoport aktív tagjai kapnak bérletet.
//  Ha a hívó átadja a saját (tranzakcióban lévő) kapcsolatát – pl. a sikeres
//  fizetés feldolgozása –, akkor abban fut, és a commit/rollback a hívóé.
// ---------------------------------------------------------------------
async function berletLetrehozas(rendelesId, kezdet, vege, kulsoKapcsolat) {
  const kapcsolat = kulsoKapcsolat || (await pool.getConnection());
  try {
    if (!kulsoKapcsolat) await kapcsolat.beginTransaction();

    const [berlet] = await kapcsolat.query(
      "INSERT INTO berlet (rendeles_id, ervenyes_kezdet, ervenyes_vege) VALUES (?, ?, ?)",
      [rendelesId, kezdet, vege]
    );

    // vezető + aktív tagok (a vezető sora a tagok közt is lehet → DISTINCT)
    const [birtokosok] = await kapcsolat.query(
      `SELECT c.vezeto_felhasznalo_id AS felhasznalo_id
         FROM rendeles r JOIN csoport c ON c.csoport_id = r.csoport_id
        WHERE r.rendeles_id = ?
       UNION
       SELECT t.felhasznalo_id
         FROM rendeles r JOIN csoport_tagok t ON t.csoport_id = r.csoport_id
        WHERE r.rendeles_id = ? AND t.tag_allapot = 'aktiv'`,
      [rendelesId, rendelesId]
    );

    for (const b of birtokosok) {
      await kapcsolat.query(
        "INSERT INTO felhasznalo_berlet (felhasznalo_id, berlet_id, qr_token) VALUES (?, ?, ?)",
        [b.felhasznalo_id, berlet.insertId, crypto.randomUUID()]
      );
    }

    if (!kulsoKapcsolat) await kapcsolat.commit();
    return { berlet_id: berlet.insertId, birtokosok_szama: birtokosok.length };
  } catch (err) {
    if (!kulsoKapcsolat) await kapcsolat.rollback();
    throw err;
  } finally {
    if (!kulsoKapcsolat) kapcsolat.release();
  }
}


/*
// ---------- BÉRLET LÉTREHOZÁSA (csak a vezető) ----------
// Body: { rendeles_id, ervenyes_kezdet, ervenyes_vege }   (pl. "2026-11-01 08:00")
router.post("/", async (req, res) => {
  try {
    const { rendeles_id, ervenyes_kezdet, ervenyes_vege } = req.body || {};

    if (!rendeles_id || !ervenyes_kezdet || !ervenyes_vege) {
      return res.status(400).json({ error: "Hiányzó mezők" });
    }
    if (!Number.isInteger(Number(rendeles_id))) {
      return res.status(400).json({ error: "Hibás rendelés azonosító" });
    }
    const kezdet = new Date(ervenyes_kezdet);
    const vege = new Date(ervenyes_vege);
    if (isNaN(kezdet) || isNaN(vege)) return res.status(400).json({ error: "Érvénytelen dátum" });
    if (vege < kezdet) return res.status(400).json({ error: "A vége nem lehet a kezdet előtt" });

    const [sorok] = await pool.query(
      `SELECT r.allapot, c.vezeto_felhasznalo_id, c.allapot AS csoport_allapot,
              (SELECT COUNT(*) FROM berlet b WHERE b.rendeles_id = r.rendeles_id) AS van_berlet
         FROM rendeles r JOIN csoport c ON c.csoport_id = r.csoport_id
        WHERE r.rendeles_id = ?`,
      [rendeles_id]
    );
    const rendeles = sorok[0];

    if (!rendeles || rendeles.csoport_allapot === "torolt") {
      return res.status(404).json({ error: "Nincs ilyen rendelés" });
    }
    if (rendeles.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a csoport vezetője indíthatja a vásárlást" });
    }
    if (rendeles.allapot !== "kifizetve") return res.status(409).json({ error: "A rendelés még nincs kifizetve" });
    if (rendeles.van_berlet) return res.status(409).json({ error: "Ehhez a rendeléshez már van bérlet" });

    const eredmeny = await berletLetrehozas(rendeles_id, ervenyes_kezdet, ervenyes_vege);
    res.status(201).json(eredmeny);
  } catch (err) {
    hibaValasz(res, err);
  }
});
*/
// ---------- SAJÁT BÉRLETEIM ----------
router.get("/", async (req, res) => {
  try {
    await allapotFrissites();

    const [sorok] = await pool.query(
      `SELECT b.berlet_id, b.vasarlas_datum, b.ervenyes_kezdet, b.ervenyes_vege, b.allapot,
              c.csoport_id, c.csoport_nev,
              ${MEG_TAG_SQL} AS meg_tag,
              (${MEG_TAG_SQL} AND b.allapot = 'aktiv') AS hasznalhato
         FROM felhasznalo_berlet fb
         JOIN berlet   b ON b.berlet_id   = fb.berlet_id
         JOIN rendeles r ON r.rendeles_id = b.rendeles_id
         JOIN csoport  c ON c.csoport_id  = r.csoport_id
        WHERE fb.felhasznalo_id = ?
        ORDER BY b.ervenyes_kezdet DESC`,
      [req.user.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- EGY BÉRLET RÉSZLETEI ----------
// Melyik látványosság mely területeire érvényes. A vezető a birtokosokat is látja.
router.get("/:id", async (req, res) => {
  try {
    if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: "Hibás azonosító" });

    await allapotFrissites();

    const [sorok] = await pool.query(
      `SELECT b.*, c.csoport_id, c.csoport_nev, c.vezeto_felhasznalo_id
         FROM berlet b
         JOIN rendeles r ON r.rendeles_id = b.rendeles_id
         JOIN csoport  c ON c.csoport_id  = r.csoport_id
        WHERE b.berlet_id = ?
          AND (c.vezeto_felhasznalo_id = ?
               OR EXISTS (SELECT 1 FROM felhasznalo_berlet fb
                           WHERE fb.berlet_id = b.berlet_id AND fb.felhasznalo_id = ?))`,
      [req.params.id, req.user.id, req.user.id]
    );
    if (!sorok.length) return res.status(404).json({ error: "Nincs ilyen bérlet" });
    const berlet = sorok[0];

    const [teruletek] = await pool.query(
      `SELECT l.latvanyossag_id, l.megnevezes AS latvanyossag,
              t.terulet_id, t.terulet_megnevezes, t.terulet_ar
         FROM rendeles_teruletei rt
         JOIN latvanyossag_terulet t ON t.terulet_id      = rt.terulet_id
         JOIN latvanyossag         l ON l.latvanyossag_id = t.latvanyossag_id
        WHERE rt.rendeles_id = ?
        ORDER BY l.megnevezes, t.terulet_megnevezes`,
      [berlet.rendeles_id]
    );

    let birtokosok;
    if (berlet.vezeto_felhasznalo_id === req.user.id) {
      [birtokosok] = await pool.query(
        `SELECT f.felhasznalo_id, f.vezeteknev, f.keresztnev, ${MEG_TAG_SQL} AS meg_tag
           FROM felhasznalo_berlet fb
           JOIN felhasznalo f ON f.felhasznalo_id = fb.felhasznalo_id
           JOIN berlet   b ON b.berlet_id   = fb.berlet_id
           JOIN rendeles r ON r.rendeles_id = b.rendeles_id
           JOIN csoport  c ON c.csoport_id  = r.csoport_id
          WHERE fb.berlet_id = ?
          ORDER BY f.vezeteknev, f.keresztnev`,
        [berlet.berlet_id]
      );
    }

    res.json({ ...berlet, teruletek, birtokosok });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- SAJÁT QR TOKEN ----------
// A frontend rajzolja ki belőle a QR kódot.
router.get("/:id/qr", async (req, res) => {
  try {
    if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: "Hibás azonosító" });

    await allapotFrissites();

    const [sorok] = await pool.query(
      `SELECT fb.qr_token, b.allapot, ${MEG_TAG_SQL} AS meg_tag
         FROM felhasznalo_berlet fb
         JOIN berlet   b ON b.berlet_id   = fb.berlet_id
         JOIN rendeles r ON r.rendeles_id = b.rendeles_id
         JOIN csoport  c ON c.csoport_id  = r.csoport_id
        WHERE fb.berlet_id = ? AND fb.felhasznalo_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!sorok.length) return res.status(404).json({ error: "Nincs ilyen bérleted" });

    const sor = sorok[0];
    if (!sor.meg_tag) return res.status(403).json({ error: "Kiléptél a csoportból, a bérlet nem használható" });
    if (sor.allapot === "lejart") return res.status(403).json({ error: "A bérlet lejárt" });

    res.json({ qr_token: sor.qr_token, allapot: sor.allapot });
  } catch (err) {
    hibaValasz(res, err);
  }
});

module.exports = router;
module.exports.berletLetrehozas = berletLetrehozas;