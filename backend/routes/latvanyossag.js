// =====================================================================
//  routes/latvanyossag.js - Látványosságok és a hozzájuk tartozó adatok
//
//  LÁTVÁNYOSSÁG
//  GET    /api/latvanyossag       mindenki (nem kell belépni)
//  GET    /api/latvanyossag/:id   bejelentkezett turista
//  POST   /api/latvanyossag       csak fo_admin
//  PUT    /api/latvanyossag/:id   fo_admin, ill. a SAJÁT látványosságánál a latvanyossag_admin
//  DELETE /api/latvanyossag/:id   csak fo_admin
//
//  A LÁTVÁNYOSSÁG ADATAI  (GET: mindenki; POST / PUT / DELETE: csak a SAJÁT
//  látványosságánál aktív beosztással rendelkező latvanyossag_admin)
//    /api/latvanyossag/:id/teruletek[/:teruletId]          latvanyossag_terulet
//    /api/latvanyossag/:id/kepek[/:kepId]                  latvanyossag_kep
//    /api/latvanyossag/:id/kedvezmenyek[/:kedvezmenyId]    kedvezmenytipus
//    /api/latvanyossag/:id/nyitvatartas[/:nyitvatartasId]  nyitvatartas
//    /api/latvanyossag/:id/zarva-tartas[/:zarvatartasId]   zarva_tartas
//
//  "Saját" = van aktív (kilepett_datum IS NULL) beosztása a látványosságnál.
//  A PUT/DELETE mindig a látványosság id-jára is szűr, így más látványosság
//  sorát azonosítóval sem lehet elérni (→ 404).
//
//  Minta:  router.METÓDUS(útvonal, auth, authorize("szerepkör"), handler)
//          nyilvános végpontnál az auth és az authorize kimarad.
// =====================================================================
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");

const router = express.Router();

const KEDVEZMENYEK = ["Felnőtt", "Diák", "Szociális"];
const NAPOK = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

function joId(ertek) {
  return Number.isInteger(Number(ertek)) && Number(ertek) > 0;
}

// Nem üres szöveg, legfeljebb max karakter → a levágott szöveg, különben null
function szoveg(ertek, max) {
  if (typeof ertek !== "string" || !ertek.trim() || ertek.trim().length > max) return null;
  return ertek.trim();
}

// Nem negatív szám → szám, különben null
function nemNegativ(ertek) {
  const szam = Number(ertek);
  return ertek !== "" && ertek !== null && Number.isFinite(szam) && szam >= 0 ? szam : null;
}

// "09:00" vagy "09:00:00" → "09:00:00", különben null
function ido(ertek) {
  if (typeof ertek !== "string") return null;
  const reszek = ertek.split(":");
  if (reszek.length < 2 || reszek.length > 3) return null;
  for (const resz of reszek) {
    if (resz.length !== 2) return null;
    for (const karakter of resz) if (karakter < "0" || karakter > "9") return null;
  }
  const [ora, perc, mp = 0] = reszek.map(Number);
  if (ora > 23 || perc > 59 || mp > 59) return null;
  return reszek.length === 2 ? `${ertek}:00` : ertek;
}

// Dátum szöveg (pl. "2026-12-24 08:00") → Date, különben null
function datum(ertek) {
  if (typeof ertek !== "string" || !ertek.trim()) return null;
  const d = new Date(ertek);
  return isNaN(d) ? null : d;
}

// ---------------------------------------------------------------------
//  Jogosultság: a bejelentkezett latvanyossag_admin a :id látványosság
//  saját adminja-e (aktív beosztás). Az auth + authorize után fut.
// ---------------------------------------------------------------------
async function sajatLatvanyossag(req, res, next) {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const [sorok] = await pool.query(
      `SELECT 1 FROM beosztas
        WHERE felhasznalo_id = ? AND latvanyossag_id = ? AND kilepett_datum IS NULL`,
      [req.user.id, req.params.id]
    );
    if (!sorok.length) {
      return res.status(403).json({ error: "Csak a saját látványosságod adatait módosíthatod" });
    }
    next();
  } catch (err) {
    hibaValasz(res, err);
  }
}

// A három middleware együtt: belépett + latvanyossag_admin + a saját látványossága
const sajatAdmin = [auth, authorize("latvanyossag_admin"), sajatLatvanyossag];

// Nyilvános listázás: a látványosság létezik-e
async function letezoLatvanyossag(req, res, next) {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });
    const [sorok] = await pool.query("SELECT 1 FROM latvanyossag WHERE latvanyossag_id = ?", [req.params.id]);
    if (!sorok.length) return res.status(404).json({ error: "Nincs ilyen látványosság" });
    next();
  } catch (err) {
    hibaValasz(res, err);
  }
}

// =====================================================================
//  LÁTVÁNYOSSÁG
// =====================================================================

// ---------- LISTA (nyilvános) ----------
router.get("/", async (req, res) => {
  const [sorok] = await pool.query("SELECT * FROM latvanyossag");
  res.json(sorok);
});

// ---------- EGY LÁTVÁNYOSSÁG ----------
router.get("/:id",  auth, async (req, res) => {
  const [sorok] = await pool.query("SELECT * FROM latvanyossag WHERE latvanyossag_id = ?", [
    req.params.id,
  ]);
  if (!sorok.length) return res.status(404).json({ error: "Nincs ilyen látványosság" });
  res.json(sorok[0]);
});

// ---------- ÚJ (csak fo_admin) ----------
router.post("/", auth, authorize("fo_admin"), async (req, res) => {
  const { megnevezes, tartozkodasi_cim, leiras } = req.body || {};
  if (!megnevezes || !tartozkodasi_cim || !leiras) {
    return res.status(400).json({ error: "Hiányzó mezők" });
  }

  const [eredmeny] = await pool.query(
    "INSERT INTO latvanyossag (megnevezes, tartozkodasi_cim, leiras) VALUES (?, ?, ?)",
    [megnevezes, tartozkodasi_cim, leiras]
  );
  res.status(201).json({ id: eredmeny.insertId });
});

// ---------- MÓDOSÍTÁS (fo_admin bármelyiket, latvanyossag_admin csak a sajátját) ----------
router.put("/:id", auth, authorize("fo_admin", "latvanyossag_admin"),
  (req, res, next) => (req.user.szerepkor === "fo_admin" ? next() : sajatLatvanyossag(req, res, next)),
  async (req, res) => {
    try {
      const { megnevezes, tartozkodasi_cim, leiras } = req.body || {};
      if (!megnevezes || !tartozkodasi_cim || !leiras) {
        return res.status(400).json({ error: "Hiányzó mezők" });
      }

      const [eredmeny] = await pool.query(
        `UPDATE latvanyossag SET megnevezes = ?, tartozkodasi_cim = ?, leiras = ?
          WHERE latvanyossag_id = ?`,
        [megnevezes, tartozkodasi_cim, leiras, req.params.id]
      );
      if (eredmeny.affectedRows === 0) return res.status(404).json({ error: "Nincs ilyen látványosság" });
      res.json({ message: "Módosítva" });
    } catch (err) {
      hibaValasz(res, err);
    }
});

// ---------- TÖRLÉS (csak fo_admin) ----------
router.delete("/:id", auth, authorize("fo_admin"), async (req, res) => {
  const [eredmeny] = await pool.query("DELETE FROM latvanyossag WHERE latvanyossag_id = ?", [
    req.params.id,
  ]);
  if (eredmeny.affectedRows === 0) return res.status(404).json({ error: "Nincs ilyen látványosság" });
  res.json({ message: "Törölve" });
});

// =====================================================================
//  TERÜLETEK  (latvanyossag_terulet)
//  Body: { terulet_megnevezes, terulet_leiras, terulet_ar }
// =====================================================================

function teruletAdat(body) {
  const megnevezes = szoveg(body.terulet_megnevezes, 100);
  const leiras = szoveg(body.terulet_leiras, 65535);
  const ar = nemNegativ(body.terulet_ar);
  if (!megnevezes || !leiras || ar === null) {
    return { hiba: "Hiányzó vagy hibás mezők (terulet_megnevezes ≤ 100 karakter, terulet_leiras, terulet_ar ≥ 0)" };
  }
  return { megnevezes, leiras, ar };
}

router.get("/:id/teruletek", letezoLatvanyossag, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      "SELECT * FROM latvanyossag_terulet WHERE latvanyossag_id = ? ORDER BY terulet_megnevezes",
      [req.params.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.post("/:id/teruletek", sajatAdmin, async (req, res) => {
  try {
    const adat = teruletAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `INSERT INTO latvanyossag_terulet (latvanyossag_id, terulet_megnevezes, terulet_leiras, terulet_ar)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, adat.megnevezes, adat.leiras, adat.ar]
    );
    res.status(201).json({ terulet_id: eredmeny.insertId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.put("/:id/teruletek/:teruletId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.teruletId)) return res.status(400).json({ error: "Hibás terület azonosító" });
    const adat = teruletAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `UPDATE latvanyossag_terulet SET terulet_megnevezes = ?, terulet_leiras = ?, terulet_ar = ?
        WHERE terulet_id = ? AND latvanyossag_id = ?`,
      [adat.megnevezes, adat.leiras, adat.ar, req.params.teruletId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen terület" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// Ha már rendelésben szerepel, nem törölhető (FK → 409)
router.delete("/:id/teruletek/:teruletId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.teruletId)) return res.status(400).json({ error: "Hibás terület azonosító" });

    const [eredmeny] = await pool.query(
      "DELETE FROM latvanyossag_terulet WHERE terulet_id = ? AND latvanyossag_id = ?",
      [req.params.teruletId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen terület" });
    res.json({ message: "Törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// =====================================================================
//  KÉPEK  (latvanyossag_kep)
//  Body: { kep_url }
// =====================================================================

router.get("/:id/kepek", letezoLatvanyossag, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      "SELECT * FROM latvanyossag_kep WHERE latvanyossag_id = ? ORDER BY kep_id",
      [req.params.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.post("/:id/kepek", sajatAdmin, async (req, res) => {
  try {
    const url = szoveg((req.body || {}).kep_url, 255);
    if (!url) return res.status(400).json({ error: "Hiányzó vagy túl hosszú kep_url (≤ 255 karakter)" });

    const [eredmeny] = await pool.query(
      "INSERT INTO latvanyossag_kep (latvanyossag_id, kep_url) VALUES (?, ?)",
      [req.params.id, url]
    );
    res.status(201).json({ kep_id: eredmeny.insertId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.put("/:id/kepek/:kepId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.kepId)) return res.status(400).json({ error: "Hibás kép azonosító" });
    const url = szoveg((req.body || {}).kep_url, 255);
    if (!url) return res.status(400).json({ error: "Hiányzó vagy túl hosszú kep_url (≤ 255 karakter)" });

    const [eredmeny] = await pool.query(
      "UPDATE latvanyossag_kep SET kep_url = ? WHERE kep_id = ? AND latvanyossag_id = ?",
      [url, req.params.kepId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen kép" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.delete("/:id/kepek/:kepId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.kepId)) return res.status(400).json({ error: "Hibás kép azonosító" });

    const [eredmeny] = await pool.query(
      "DELETE FROM latvanyossag_kep WHERE kep_id = ? AND latvanyossag_id = ?",
      [req.params.kepId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen kép" });
    res.json({ message: "Törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// =====================================================================
//  KEDVEZMÉNYEK  (kedvezmenytipus)
//  Body: { kedvezmeny_nev ('Felnőtt' | 'Diák' | 'Szociális'), kedvezmeny_merteke (0–100 %) }
//  Látványosságonként minden típus csak egyszer szerepelhet (→ 409).
// =====================================================================

function kedvezmenyAdat(body) {
  const mertek = nemNegativ(body.kedvezmeny_merteke);
  if (!KEDVEZMENYEK.includes(body.kedvezmeny_nev) || mertek === null || mertek > 100) {
    return { hiba: "Hibás mezők (kedvezmeny_nev: Felnőtt / Diák / Szociális, kedvezmeny_merteke: 0–100)" };
  }
  return { nev: body.kedvezmeny_nev, mertek };
}

router.get("/:id/kedvezmenyek", letezoLatvanyossag, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      "SELECT * FROM kedvezmenytipus WHERE latvanyossag_id = ? ORDER BY kedvezmeny_nev",
      [req.params.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.post("/:id/kedvezmenyek", sajatAdmin, async (req, res) => {
  try {
    const adat = kedvezmenyAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      "INSERT INTO kedvezmenytipus (latvanyossag_id, kedvezmeny_nev, kedvezmeny_merteke) VALUES (?, ?, ?)",
      [req.params.id, adat.nev, adat.mertek]
    );
    res.status(201).json({ kedvezmeny_id: eredmeny.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ez a kedvezménytípus már szerepel ennél a látványosságnál" });
    hibaValasz(res, err);
  }
});

router.put("/:id/kedvezmenyek/:kedvezmenyId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.kedvezmenyId)) return res.status(400).json({ error: "Hibás kedvezmény azonosító" });
    const adat = kedvezmenyAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `UPDATE kedvezmenytipus SET kedvezmeny_nev = ?, kedvezmeny_merteke = ?
        WHERE kedvezmeny_id = ? AND latvanyossag_id = ?`,
      [adat.nev, adat.mertek, req.params.kedvezmenyId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen kedvezmény" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ez a kedvezménytípus már szerepel ennél a látványosságnál" });
    hibaValasz(res, err);
  }
});

router.delete("/:id/kedvezmenyek/:kedvezmenyId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.kedvezmenyId)) return res.status(400).json({ error: "Hibás kedvezmény azonosító" });

    const [eredmeny] = await pool.query(
      "DELETE FROM kedvezmenytipus WHERE kedvezmeny_id = ? AND latvanyossag_id = ?",
      [req.params.kedvezmenyId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen kedvezmény" });
    res.json({ message: "Törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// =====================================================================
//  NYITVATARTÁS  (nyitvatartas)
//  Body: { nap_neve ('Hétfő' … 'Vasárnap'), allapot ('nyitva' | 'zárva'),
//          kezdet_ora, vege_ora ("09:00") – csak 'nyitva' esetén, és kezdet < vége }
//  Naponta egy sor (→ 409, ha a napra már van).
// =====================================================================

function nyitvatartasAdat(body) {
  if (!NAPOK.includes(body.nap_neve)) return { hiba: "Hibás nap_neve (Hétfő … Vasárnap)" };
  if (body.allapot === "zárva") return { nap: body.nap_neve, allapot: "zárva", kezdet: null, vege: null };
  if (body.allapot !== "nyitva") return { hiba: "Hibás allapot (nyitva / zárva)" };

  const kezdet = ido(body.kezdet_ora);
  const vege = ido(body.vege_ora);
  if (!kezdet || !vege) return { hiba: "Nyitva tartó napnál kell kezdet_ora és vege_ora (ÓÓ:PP)" };
  if (kezdet >= vege) return { hiba: "A nyitás nem lehet a zárás után" };
  return { nap: body.nap_neve, allapot: "nyitva", kezdet, vege };
}

router.get("/:id/nyitvatartas", letezoLatvanyossag, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      "SELECT * FROM nyitvatartas WHERE latvanyossag_id = ? ORDER BY nap_neve",
      [req.params.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.post("/:id/nyitvatartas", sajatAdmin, async (req, res) => {
  try {
    const adat = nyitvatartasAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `INSERT INTO nyitvatartas (latvanyossag_id, nap_neve, kezdet_ora, vege_ora, allapot)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, adat.nap, adat.kezdet, adat.vege, adat.allapot]
    );
    res.status(201).json({ nyitvatartas_id: eredmeny.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Erre a napra már van nyitvatartás, azt módosítsd" });
    hibaValasz(res, err);
  }
});

router.put("/:id/nyitvatartas/:nyitvatartasId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.nyitvatartasId)) return res.status(400).json({ error: "Hibás nyitvatartás azonosító" });
    const adat = nyitvatartasAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `UPDATE nyitvatartas SET nap_neve = ?, kezdet_ora = ?, vege_ora = ?, allapot = ?
        WHERE nyitvatartas_id = ? AND latvanyossag_id = ?`,
      [adat.nap, adat.kezdet, adat.vege, adat.allapot, req.params.nyitvatartasId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen nyitvatartás" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Erre a napra már van nyitvatartás, azt módosítsd" });
    hibaValasz(res, err);
  }
});

router.delete("/:id/nyitvatartas/:nyitvatartasId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.nyitvatartasId)) return res.status(400).json({ error: "Hibás nyitvatartás azonosító" });

    const [eredmeny] = await pool.query(
      "DELETE FROM nyitvatartas WHERE nyitvatartas_id = ? AND latvanyossag_id = ?",
      [req.params.nyitvatartasId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen nyitvatartás" });
    res.json({ message: "Törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// =====================================================================
//  ZÁRVA TARTÁS  (zarva_tartas) – pl. ünnep, karbantartás
//  Body: { kezdo_datum, vege_datum ("2026-12-24 00:00"), indok? }
// =====================================================================

function zarvaAdat(body) {
  const kezdet = datum(body.kezdo_datum);
  const vege = datum(body.vege_datum);
  if (!kezdet || !vege) return { hiba: "Hiányzó vagy hibás kezdo_datum / vege_datum (pl. 2026-12-24 00:00)" };
  if (vege < kezdet) return { hiba: "A vége nem lehet a kezdet előtt" };

  let indok = null;
  if (body.indok !== undefined && body.indok !== null && body.indok !== "") {
    indok = szoveg(body.indok, 255);
    if (!indok) return { hiba: "Az indok legfeljebb 255 karakter lehet" };
  }
  return { kezdet, vege, indok };
}

router.get("/:id/zarva-tartas", letezoLatvanyossag, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      "SELECT * FROM zarva_tartas WHERE latvanyossag_id = ? ORDER BY kezdo_datum",
      [req.params.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.post("/:id/zarva-tartas", sajatAdmin, async (req, res) => {
  try {
    const adat = zarvaAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      "INSERT INTO zarva_tartas (latvanyossag_id, kezdo_datum, vege_datum, indok) VALUES (?, ?, ?, ?)",
      [req.params.id, adat.kezdet, adat.vege, adat.indok]
    );
    res.status(201).json({ zarvatartas_id: eredmeny.insertId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.put("/:id/zarva-tartas/:zarvatartasId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.zarvatartasId)) return res.status(400).json({ error: "Hibás zárva tartás azonosító" });
    const adat = zarvaAdat(req.body || {});
    if (adat.hiba) return res.status(400).json({ error: adat.hiba });

    const [eredmeny] = await pool.query(
      `UPDATE zarva_tartas SET kezdo_datum = ?, vege_datum = ?, indok = ?
        WHERE zarvatartas_id = ? AND latvanyossag_id = ?`,
      [adat.kezdet, adat.vege, adat.indok, req.params.zarvatartasId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen zárva tartás" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

router.delete("/:id/zarva-tartas/:zarvatartasId", sajatAdmin, async (req, res) => {
  try {
    if (!joId(req.params.zarvatartasId)) return res.status(400).json({ error: "Hibás zárva tartás azonosító" });

    const [eredmeny] = await pool.query(
      "DELETE FROM zarva_tartas WHERE zarvatartas_id = ? AND latvanyossag_id = ?",
      [req.params.zarvatartasId, req.params.id]
    );
    if (!eredmeny.affectedRows) return res.status(404).json({ error: "Nincs ilyen zárva tartás" });
    res.json({ message: "Törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

module.exports = router;
