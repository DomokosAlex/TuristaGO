// EBBEN A  bariont használjuk.
// a csoport vezetője tudja elinditani a fizetési folyamatot.

// =====================================================================
//  routes/rendeles_fizetes.js – Fizetés Barionnal
//
//  POST /api/fizetes/rendeles/:rendelesId   fizetés indítása → Barion fizetőoldal címe (vezető)
//  GET  /api/fizetes/rendeles/:rendelesId   a rendelés fizetési kísérletei (vezető, aktív tag)
//  GET  /api/fizetes/:id/allapot            állapot frissítése a Barionból       (vezető)
//  POST /api/fizetes/callback               a Barion értesít az állapotváltozásról (nyilvános)
//  GET  /api/fizetes/vissza                 ide irányít vissza a Barion fizetés után (nyilvános)
//
//  Folyamat:
//   1. A vezető elindítja a fizetést → új sor a `fizetes` táblában ('Prepared'),
//      a válaszban kapott gateway_url-re kell átirányítani a böngészőt.
//   2. A Barion a callback címre szól, ha változott az állapot; mi ekkor
//      lekérdezzük a valódi állapotot a Bariontól (a callbacknek nem hiszünk vakon).
//   3. Sikeres fizetésnél egy tranzakcióban:
//        fizetes.statusz = 'Succeeded', rendeles.allapot = 'kifizetve', új `szamla` sor,
//        és automatikusan létrejön a bérlet (berlet.js → berletLetrehozas).
//        IDEIGLENES érvényesség: most-tól 2 napig (BERLET_ERVENYESSEG_NAP).
//
//  Szabályok:
//   - Rendelésenként több fizetési kísérlet lehet (pl. egy sikertelen után új).
//   - Ha van még le nem zárt kísérlet, nem indul új: a régi fizetőoldal címét kapod vissza
//     (így nem lehet ugyanazt a rendelést kétszer kifizetni).
//   - A már 'Succeeded' fizetés állapota nem változik vissza.
//   - Indítás előtt a rendelés összegét újraszámoljuk (utils/osszeg.js).
//   - A rendelést és a területeit a rendeles.js kezeli.
// =====================================================================
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");
const barion = require("../utils/barion");
const { osszegFrissites } = require("../utils/osszeg");
const { berletLetrehozas } = require("./berlet");

const router = express.Router();

// A fizetes.statusz ENUM értékei (megegyeznek a Barion állapotaival)
const STATUSZOK = [
  "Prepared", "Started", "InProgress", "Waiting", "Reserved", "Authorized",
  "Succeeded", "PartiallySucceeded", "Canceled", "Expired", "Failed",
];
// Ezek még nem végleges állapotok, a fizetés még befejeződhet
const NYITOTT_STATUSZOK = ["Prepared", "Started", "InProgress", "Waiting", "Reserved", "Authorized"];

const AFA_KULCS = 27;
const BERLET_ERVENYESSEG_NAP = 2; // ideiglenes: sikeres fizetéskor a bérlet most + 2 napig érvényes

function backendUrl() {
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
}

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

// Új, egyedi azonosító a mintaadat formájában: TG-PR-20261022-0002
async function ujPaymentRequestId() {
  const most = new Date();
  const datum =
    most.getFullYear() +
    String(most.getMonth() + 1).padStart(2, "0") +
    String(most.getDate()).padStart(2, "0");
  const elotag = `TG-PR-${datum}-`;

  const [sorok] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(payment_request_id, ?) AS UNSIGNED)) AS utolso
       FROM fizetes WHERE payment_request_id LIKE ?`,
    [elotag.length + 1, elotag + "%"]
  );
  return elotag + String((sorok[0].utolso || 0) + 1).padStart(4, "0");
}

// Számla kiállítása a sikeres fizetéshez (a hívó tranzakciójában)
// Számlaszám: TG-2026-000007
async function szamlaKiallitas(kapcsolat, fizetes) {
  const [vevo] = await kapcsolat.query(
    `SELECT CONCAT(f.vezeteknev, ' ', f.keresztnev) AS nev, f.lakcim
       FROM rendeles r
       JOIN csoport c     ON c.csoport_id     = r.csoport_id
       JOIN felhasznalo f ON f.felhasznalo_id = c.vezeto_felhasznalo_id
      WHERE r.rendeles_id = ?`,
    [fizetes.rendeles_id]
  );

  const elotag = `TG-${new Date().getFullYear()}-`;
  const [max] = await kapcsolat.query(
    `SELECT MAX(CAST(SUBSTRING(szamlaszam, ?) AS UNSIGNED)) AS utolso
       FROM szamla WHERE szamlaszam LIKE ? FOR UPDATE`,
    [elotag.length + 1, elotag + "%"]
  );
  const szamlaszam = elotag + String((max[0].utolso || 0) + 1).padStart(6, "0");

  const brutto = Number(fizetes.vegosszeg);
  const netto = Math.round((brutto / (1 + AFA_KULCS / 100)) * 100) / 100;

  await kapcsolat.query(
    `INSERT INTO szamla
       (fizetes_id, szamlaszam, netto_osszeg, afa_kulcs, brutto_osszeg, penznem, vevo_nev, vevo_lakcim)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fizetes.fizetes_id, szamlaszam, netto, AFA_KULCS, brutto, fizetes.penznem, vevo[0].nev, vevo[0].lakcim]
  );
}

// Sikeres fizetés után a bérlet létrehozása (a hívó tranzakciójában).
// IDEIGLENES érvényesség: most kezdődik, BERLET_ERVENYESSEG_NAP nap múlva jár le.
// (A dátumokat az adatbázistól kérjük, hogy ugyanaz az óra legyen, mint a NOW()-nál.)
async function berletAutomatikusan(kapcsolat, rendelesId) {
  const [van] = await kapcsolat.query("SELECT 1 FROM berlet WHERE rendeles_id = ?", [rendelesId]);
  if (van.length) return null;

  const [idok] = await kapcsolat.query(
    "SELECT NOW() AS kezdet, DATE_ADD(NOW(), INTERVAL ? DAY) AS vege",
    [BERLET_ERVENYESSEG_NAP]
  );
  return berletLetrehozas(rendelesId, idok[0].kezdet, idok[0].vege, kapcsolat);
}

// ---------------------------------------------------------------------
//  A Barionból lekérdezett állapot átvezetése az adatbázisba.
//  Ezt használja a callback, a visszairányítás és a kézi frissítés is.
//  Visszaadja a frissített fizetes sort (vagy null-t, ha nincs ilyen).
// ---------------------------------------------------------------------
async function allapotFeldolgozas(paymentId) {
  const allapot = await barion.fizetesAllapot(paymentId);
  const ujStatusz = STATUSZOK.includes(allapot.Status) ? allapot.Status : null;

  const kapcsolat = await pool.getConnection();
  let berlet = null;
  try {
    await kapcsolat.beginTransaction();

    const [sorok] = await kapcsolat.query(
      "SELECT * FROM fizetes WHERE barion_payment_id = ? FOR UPDATE",
      [paymentId]
    );
    const fizetes = sorok[0];

    // ismeretlen fizetés, ismeretlen állapot, már sikeres vagy nem változott → nincs teendő
    if (!fizetes || !ujStatusz || fizetes.statusz === "Succeeded" || fizetes.statusz === ujStatusz) {
      await kapcsolat.commit();
      return fizetes || null;
    }

    await kapcsolat.query(
      "UPDATE fizetes SET statusz = ?, utolso_frissites = NOW() WHERE fizetes_id = ?",
      [ujStatusz, fizetes.fizetes_id]
    );

    if (ujStatusz === "Succeeded") {
      if (allapot.Total != null && Number(allapot.Total) !== Number(fizetes.vegosszeg)) {
        console.warn(
          `Barion összeg eltérés: fizetes_id=${fizetes.fizetes_id}, ` +
            `nálunk ${fizetes.vegosszeg}, Barion ${allapot.Total}`
        );
      }
      const [kifizetve] = await kapcsolat.query(
        "UPDATE rendeles SET allapot = 'kifizetve' WHERE rendeles_id = ? AND allapot = 'folyamatban'",
        [fizetes.rendeles_id]
      );
      await szamlaKiallitas(kapcsolat, fizetes);

      // Bérlet automatikusan (ha a rendelés most lett kifizetve és még nincs bérlete)
      if (kifizetve.affectedRows) {
        berlet = await berletAutomatikusan(kapcsolat, fizetes.rendeles_id);
      }
    }

    await kapcsolat.commit();
    return { ...fizetes, statusz: ujStatusz, berlet_id: berlet ? berlet.berlet_id : null };
  } catch (err) {
    await kapcsolat.rollback();
    throw err;
  } finally {
    kapcsolat.release();
  }
}

// A rendelés + csoport adatai, ha a csoport nem törölt
async function rendelesBetolt(rendelesId) {
  const [sorok] = await pool.query(
    `SELECT r.rendeles_id, r.allapot, r.osszeg, r.csoport_id,
            c.csoport_nev, c.vezeto_felhasznalo_id, f.email AS vezeto_email
       FROM rendeles r
       JOIN csoport c     ON c.csoport_id     = r.csoport_id
       JOIN felhasznalo f ON f.felhasznalo_id = c.vezeto_felhasznalo_id
      WHERE r.rendeles_id = ? AND c.allapot <> 'torolt'`,
    [rendelesId]
  );
  return sorok[0];
}

// ---------- FIZETÉS INDÍTÁSA (csak a vezető) ----------
// Válasz: { fizetes_id, payment_request_id, payment_id, gateway_url }
// A frontend a gateway_url-re irányítja a felhasználót.
router.post("/rendeles/:rendelesId", auth, authorize("turista"), async (req, res) => {
  try {
    const rendelesId = Number(req.params.rendelesId);
    if (!Number.isInteger(rendelesId)) return res.status(400).json({ error: "Hibás rendelés azonosító" });

    let rendeles = await rendelesBetolt(rendelesId);
    if (!rendeles) return res.status(404).json({ error: "Nincs ilyen rendelés" });
    if (rendeles.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a csoport vezetője indíthatja a fizetést" });
    }

    // A nyitott kísérletek állapotát előbb frissítjük a Barionból
    const [nyitottak] = await pool.query(
      `SELECT fizetes_id, barion_payment_id FROM fizetes
        WHERE rendeles_id = ? AND barion_payment_id IS NOT NULL AND statusz IN (?)`,
      [rendelesId, NYITOTT_STATUSZOK]
    );
    for (const ny of nyitottak) {
      try {
        await allapotFeldolgozas(ny.barion_payment_id);
      } catch (err) {
        console.error(err);
      }
    }

    rendeles = await rendelesBetolt(rendelesId);
    if (rendeles.allapot === "kifizetve") return res.status(409).json({ error: "A rendelés már ki van fizetve" });
    if (rendeles.allapot === "torolt") return res.status(409).json({ error: "A rendelés törölve van" });

    // Ha még van le nem zárt kísérlet, azt folytatja (nem indul új → nincs dupla fizetés)
    const [meglevo] = await pool.query(
      `SELECT fizetes_id, payment_request_id, barion_payment_id FROM fizetes
        WHERE rendeles_id = ? AND barion_payment_id IS NOT NULL AND statusz IN (?)
        ORDER BY kiserlet_idopontja DESC LIMIT 1`,
      [rendelesId, NYITOTT_STATUSZOK]
    );
    if (meglevo.length) {
      const m = meglevo[0];
      return res.json({
        fizetes_id: m.fizetes_id,
        payment_request_id: m.payment_request_id,
        payment_id: m.barion_payment_id,
        gateway_url: barion.gatewayUrl(m.barion_payment_id),
        folytatas: true,
      });
    }

    // Az összeget fizetés előtt újraszámoljuk (a csoport tagjai közben változhattak)
    const osszeg = Math.round(await osszegFrissites(pool, rendelesId)); // HUF: egész forint
    if (osszeg <= 0) return res.status(409).json({ error: "A rendelés összege 0, nincs mit fizetni" });

    // Megvásárolt területek a tétel leírásához
    const [teruletek] = await pool.query(
      `SELECT CONCAT(l.megnevezes, ' – ', t.terulet_megnevezes) AS nev
         FROM rendeles_teruletei rt
         JOIN latvanyossag_terulet t ON t.terulet_id      = rt.terulet_id
         JOIN latvanyossag         l ON l.latvanyossag_id = t.latvanyossag_id
        WHERE rt.rendeles_id = ?
        ORDER BY l.megnevezes, t.terulet_megnevezes`,
      [rendelesId]
    );
    const leiras = (teruletek.map((t) => t.nev).join(", ") || rendeles.csoport_nev).slice(0, 250);

    const paymentRequestId = await ujPaymentRequestId();
    const [uj] = await pool.query(
      `INSERT INTO fizetes (rendeles_id, payment_request_id, vegosszeg, penznem, statusz)
       VALUES (?, ?, ?, 'HUF', 'Prepared')`,
      [rendelesId, paymentRequestId, osszeg]
    );
    const fizetesId = uj.insertId;

    let valasz;
    try {
      valasz = await barion.fizetesInditas({
        paymentRequestId,
        osszeg,
        penznem: "HUF",
        payerEmail: rendeles.vezeto_email,
        megnevezes: `TuristaGo rendelés #${rendelesId}`,
        leiras,
        redirectUrl: `${backendUrl()}/api/fizetes/vissza`,
        callbackUrl: `${backendUrl()}/api/fizetes/callback`,
      });
    } catch (err) {
      await pool.query(
        "UPDATE fizetes SET statusz = 'Failed', utolso_frissites = NOW() WHERE fizetes_id = ?",
        [fizetesId]
      );
      throw err;
    }

    await pool.query(
      "UPDATE fizetes SET barion_payment_id = ?, utolso_frissites = NOW() WHERE fizetes_id = ?",
      [valasz.PaymentId, fizetesId]
    );

    res.status(201).json({
      fizetes_id: fizetesId,
      payment_request_id: paymentRequestId,
      payment_id: valasz.PaymentId,
      gateway_url: valasz.GatewayUrl,
    });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- A RENDELÉS FIZETÉSI KÍSÉRLETEI ----------
router.get("/rendeles/:rendelesId", auth, authorize("turista"), async (req, res) => {
  try {
    const rendelesId = Number(req.params.rendelesId);
    if (!Number.isInteger(rendelesId)) return res.status(400).json({ error: "Hibás rendelés azonosító" });

    const rendeles = await rendelesBetolt(rendelesId);
    if (!rendeles) return res.status(404).json({ error: "Nincs ilyen rendelés" });

    if (rendeles.vezeto_felhasznalo_id !== req.user.id) {
      const [tag] = await pool.query(
        `SELECT 1 FROM csoport_tagok
          WHERE csoport_id = ? AND felhasznalo_id = ? AND tag_allapot = 'aktiv'`,
        [rendeles.csoport_id, req.user.id]
      );
      if (!tag.length) return res.status(404).json({ error: "Nincs ilyen rendelés" });
    }

    const [sorok] = await pool.query(
      `SELECT f.fizetes_id, f.payment_request_id, f.barion_payment_id, f.vegosszeg, f.penznem,
              f.statusz, f.kiserlet_idopontja, f.utolso_frissites, sz.szamlaszam
         FROM fizetes f
         LEFT JOIN szamla sz ON sz.fizetes_id = f.fizetes_id
        WHERE f.rendeles_id = ?
        ORDER BY f.kiserlet_idopontja DESC`,
      [rendelesId]
    );
    res.json({ rendeles_id: rendelesId, rendeles_allapot: rendeles.allapot, fizetesek: sorok });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- ÁLLAPOT FRISSÍTÉSE A BARIONBÓL (vezető) ----------
// Ha a callback nem érkezett meg (pl. helyi gépen fut a szerver), ezzel kézzel is frissíthető.
router.get("/:id/allapot", auth, authorize("turista"), async (req, res) => {
  try {
    if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: "Hibás azonosító" });

    const [sorok] = await pool.query(
      `SELECT f.*, c.vezeto_felhasznalo_id
         FROM fizetes f
         JOIN rendeles r ON r.rendeles_id = f.rendeles_id
         JOIN csoport  c ON c.csoport_id  = r.csoport_id
        WHERE f.fizetes_id = ?`,
      [req.params.id]
    );
    const fizetes = sorok[0];
    if (!fizetes || fizetes.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(404).json({ error: "Nincs ilyen fizetés" });
    }

    let statusz = fizetes.statusz;
    if (fizetes.barion_payment_id) {
      const frissitett = await allapotFeldolgozas(fizetes.barion_payment_id);
      if (frissitett) statusz = frissitett.statusz;
    }

    const [r] = await pool.query(
      `SELECT r.allapot, b.berlet_id
         FROM rendeles r LEFT JOIN berlet b ON b.rendeles_id = r.rendeles_id
        WHERE r.rendeles_id = ?`,
      [fizetes.rendeles_id]
    );
    res.json({
      fizetes_id: fizetes.fizetes_id,
      rendeles_id: fizetes.rendeles_id,
      statusz,
      rendeles_allapot: r[0].allapot,
      berlet_id: r[0].berlet_id,
    });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- BARION CALLBACK (nyilvános) ----------
// A Barion POST-tal küldi a PaymentId-t (űrlap mezőben vagy a query stringben).
// 200 = feldolgoztuk; más válasznál a Barion később újrapróbálja.
router.post("/callback", express.urlencoded({ extended: false }), async (req, res) => {
  const paymentId = (req.body && req.body.PaymentId) || req.query.paymentId || req.query.PaymentId;
  if (!paymentId) return res.status(400).send("Hiányzó PaymentId");

  try {
    await allapotFeldolgozas(String(paymentId));
    res.status(200).send("OK");
  } catch (err) {
    console.error("Barion callback hiba:", err);
    res.status(500).send("Hiba");
  }
});

// ---------- VISSZAIRÁNYÍTÁS A FIZETÉS UTÁN (nyilvános) ----------
// A Barion ide küldi vissza a böngészőt: /api/fizetes/vissza?paymentId=...
// Ha be van állítva a FRONTEND_FIZETES_URL, oda irányít tovább, különben JSON-t ad.
router.get("/vissza", async (req, res) => {
  const paymentId = req.query.paymentId || req.query.PaymentId;
  if (!paymentId) return res.status(400).json({ error: "Hiányzó paymentId" });

  let fizetes = null;
  try {
    fizetes = await allapotFeldolgozas(String(paymentId));
  } catch (err) {
    console.error("Barion visszairányítás hiba:", err);
  }

  let berletId = null;
  if (fizetes) {
    const [b] = await pool.query("SELECT berlet_id FROM berlet WHERE rendeles_id = ?", [fizetes.rendeles_id]);
    if (b.length) berletId = b[0].berlet_id;
  }

  const eredmeny = {
    statusz: fizetes ? fizetes.statusz : "ismeretlen",
    rendeles_id: fizetes ? fizetes.rendeles_id : null,
    fizetes_id: fizetes ? fizetes.fizetes_id : null,
    berlet_id: berletId,
  };

  if (process.env.FRONTEND_FIZETES_URL) {
    const url = new URL(process.env.FRONTEND_FIZETES_URL);
    for (const [kulcs, ertek] of Object.entries(eredmeny)) {
      if (ertek != null) url.searchParams.set(kulcs, ertek);
    }
    return res.redirect(url.toString());
  }
  res.json(eredmeny);
});

// ---------------------------------------------------------------------
//  Van-e a rendelésnek le nem zárt fizetése? (a rendeles.js használja)
//  A nyitott kísérleteket előbb frissíti a Barionból, így a régóta
//  'Prepared' (valójában lejárt) kísérletek nem zárják le a rendelést.
//  Ha a Barion nem érhető el, biztonságból nyitottnak tekinti.
// ---------------------------------------------------------------------
async function nyitottFizetesVan(rendelesId) {
  const [nyitottak] = await pool.query(
    "SELECT barion_payment_id FROM fizetes WHERE rendeles_id = ? AND statusz IN (?)",
    [rendelesId, NYITOTT_STATUSZOK]
  );

  for (const ny of nyitottak) {
    if (!ny.barion_payment_id) continue; // az indítás közben elakadt kísérlet
    try {
      const frissitett = await allapotFeldolgozas(ny.barion_payment_id);
      if (frissitett && NYITOTT_STATUSZOK.includes(frissitett.statusz)) return true;
    } catch (err) {
      console.error(err);
      return true;
    }
  }
  return false;
}

module.exports = router;
module.exports.allapotFeldolgozas = allapotFeldolgozas;
module.exports.nyitottFizetesVan = nyitottFizetesVan;
module.exports.NYITOTT_STATUSZOK = NYITOTT_STATUSZOK;
