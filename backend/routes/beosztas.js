// =====================================================================
//  routes/beosztas.js – Beosztottak kezelése (csak latvanyossag_admin)
//
//  GET    /api/beosztas          saját látványosság dolgozói (?mind=1 → a kilépettek is)
//  GET    /api/beosztas/:id      egy beosztás részletei
//  POST   /api/beosztas          új dolgozó felvétele + beosztás
//  PUT    /api/beosztas/:id      a dolgozó adatainak módosítása
//  DELETE /api/beosztas/:id      beosztás lezárása + dolgozó törlése
//
//  A látványosság MINDIG az admin saját aktív beosztásából jön,
//  így egy admin csak a saját látványossága dolgozóit éri el.
//  Az :id mindenhol a beosztas_id.
// =====================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");
const { felhasznaloBeosztassal } = require("../utils/munkatars");

const router = express.Router();

// Minden végponthoz bejelentkezés + latvanyossag_admin szerepkör kell
router.use(auth, authorize("latvanyossag_admin"));

// A bejelentkezett admin látványossága (aktív beosztásból), vagy null
async function sajatLatvanyossag(adminId) {
  const [sorok] = await pool.query(
    "SELECT latvanyossag_id FROM beosztas WHERE felhasznalo_id = ? AND kilepett_datum IS NULL LIMIT 1",
    [adminId]
  );
  return sorok.length ? sorok[0].latvanyossag_id : null;
}

// Egy dolgozói beosztás az admin látványosságánál (vagy undefined)
async function dolgozoiBeosztas(beosztasId, latvanyossagId) {
  const [sorok] = await pool.query(
    `SELECT b.beosztas_id, b.felhasznalo_id, b.latvanyossag_id,
            b.csatlakozas_datum, b.kilepett_datum,
            f.vezeteknev, f.keresztnev, f.email, f.lakcim, f.foto_url,
            s.megnevezes AS szerepkor
       FROM beosztas b
       LEFT JOIN felhasznalo f ON f.felhasznalo_id = b.felhasznalo_id
       LEFT JOIN szerepkor   s ON s.szerepkor_id   = f.szerepkor_id
      WHERE b.beosztas_id = ? AND b.latvanyossag_id = ?
        AND (b.felhasznalo_id IS NULL OR s.megnevezes = 'dolgozo')`,
    [beosztasId, latvanyossagId]
  );
  return sorok[0];
}

// ---------- LISTA ----------
// Alapból csak az aktív dolgozók, ?mind=1 esetén a kilépettek is.
// (Törölt dolgozónál a név mezők NULL-ok, mert a felhasználó már nincs meg.)
router.get("/", async (req, res) => {
  try {
    const latvanyossagId = await sajatLatvanyossag(req.user.id);
    if (!latvanyossagId) return res.status(403).json({ error: "Nincs aktív látványosság beosztásod" });

    const mind = req.query.mind === "1";

    const [sorok] = await pool.query(
      `SELECT b.beosztas_id, b.felhasznalo_id, b.csatlakozas_datum, b.kilepett_datum,
              f.vezeteknev, f.keresztnev, f.email
         FROM beosztas b
         LEFT JOIN felhasznalo f ON f.felhasznalo_id = b.felhasznalo_id
         LEFT JOIN szerepkor   s ON s.szerepkor_id   = f.szerepkor_id
        WHERE b.latvanyossag_id = ?
          AND (b.felhasznalo_id IS NULL OR s.megnevezes = 'dolgozo')
          AND (? OR b.kilepett_datum IS NULL)
        ORDER BY b.kilepett_datum IS NOT NULL, f.vezeteknev, f.keresztnev`,
      [latvanyossagId, mind]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- EGY BEOSZTÁS ----------
router.get("/:id", async (req, res) => {
  try {
    if (!Number.isInteger(Number(req.params.id))) {
      return res.status(400).json({ error: "Hibás azonosító" });
    }

    const latvanyossagId = await sajatLatvanyossag(req.user.id);
    if (!latvanyossagId) return res.status(403).json({ error: "Nincs aktív látványosság beosztásod" });

    const beosztas = await dolgozoiBeosztas(req.params.id, latvanyossagId);
    if (!beosztas) return res.status(404).json({ error: "Nincs ilyen beosztás" });
    res.json(beosztas);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- ÚJ DOLGOZÓ + BEOSZTÁS ----------
// Body: { vezeteknev, keresztnev, email, jelszo, lakcim, foto_url? }
router.post("/", async (req, res) => {
  try {
    const { vezeteknev, keresztnev, email, jelszo, lakcim } = req.body || {};

    if (!vezeteknev || !keresztnev || !email || !jelszo || !lakcim) {
      return res.status(400).json({ error: "Hiányzó mezők" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Érvénytelen email cím" });
    }
    if (jelszo.length < 6) {
      return res.status(400).json({ error: "A jelszó legalább 6 karakter legyen" });
    }

    const latvanyossagId = await sajatLatvanyossag(req.user.id);
    if (!latvanyossagId) return res.status(403).json({ error: "Nincs aktív látványosság beosztásod" });

    const eredmeny = await felhasznaloBeosztassal(req.body, "dolgozo", latvanyossagId);
    res.status(201).json(eredmeny);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- DOLGOZÓ ADATAINAK MÓDOSÍTÁSA ----------
// Body: { vezeteknev, keresztnev, email, lakcim, foto_url?, jelszo? }
// A jelszó csak akkor változik, ha megadják.
router.put("/:id", async (req, res) => {
  try {
    if (!Number.isInteger(Number(req.params.id))) {
      return res.status(400).json({ error: "Hibás azonosító" });
    }

    const { vezeteknev, keresztnev, email, lakcim, foto_url, jelszo } = req.body || {};

    if (!vezeteknev || !keresztnev || !email || !lakcim) {
      return res.status(400).json({ error: "Hiányzó mezők" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Érvénytelen email cím" });
    }
    if (jelszo && jelszo.length < 6) {
      return res.status(400).json({ error: "A jelszó legalább 6 karakter legyen" });
    }

    const latvanyossagId = await sajatLatvanyossag(req.user.id);
    if (!latvanyossagId) return res.status(403).json({ error: "Nincs aktív látványosság beosztásod" });

    const beosztas = await dolgozoiBeosztas(req.params.id, latvanyossagId);
    if (!beosztas) return res.status(404).json({ error: "Nincs ilyen beosztás" });
    if (beosztas.kilepett_datum || !beosztas.felhasznalo_id) {
      return res.status(409).json({ error: "Ez a beosztás már le van zárva" });
    }

    const jelszoHash = jelszo ? await bcrypt.hash(jelszo, 10) : null;

    await pool.query(
      `UPDATE felhasznalo
          SET vezeteknev = ?, keresztnev = ?, email = ?, lakcim = ?,
              foto_url = COALESCE(?, foto_url),
              jelszo_hash = COALESCE(?, jelszo_hash)
        WHERE felhasznalo_id = ?`,
      [vezeteknev, keresztnev, email, lakcim, foto_url || null, jelszoHash, beosztas.felhasznalo_id]
    );
    res.json({ message: "Módosítva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- BEOSZTÁS LEZÁRÁSA + DOLGOZÓ TÖRLÉSE ----------
// A beosztás sor megmarad kilépési dátummal, a felhasználó törlődik.
// Ha a dolgozónak más látványosságnál is van aktív beosztása, az is lezárul.
router.delete("/:id", async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) {
    return res.status(400).json({ error: "Hibás azonosító" });
  }

  let kapcsolat;
  try {
    const latvanyossagId = await sajatLatvanyossag(req.user.id);
    if (!latvanyossagId) return res.status(403).json({ error: "Nincs aktív látványosság beosztásod" });

    const beosztas = await dolgozoiBeosztas(req.params.id, latvanyossagId);
    if (!beosztas) return res.status(404).json({ error: "Nincs ilyen beosztás" });
    if (beosztas.kilepett_datum || !beosztas.felhasznalo_id) {
      return res.status(409).json({ error: "Ez a beosztás már le van zárva" });
    }

    kapcsolat = await pool.getConnection();
    await kapcsolat.beginTransaction();

    await kapcsolat.query(
      "UPDATE beosztas SET kilepett_datum = NOW() WHERE felhasznalo_id = ? AND kilepett_datum IS NULL",
      [beosztas.felhasznalo_id]
    );
    await kapcsolat.query("DELETE FROM felhasznalo WHERE felhasznalo_id = ?", [beosztas.felhasznalo_id]);

    await kapcsolat.commit();
    res.json({ message: "A beosztás lezárva, a dolgozó törölve" });
  } catch (err) {
    if (kapcsolat) await kapcsolat.rollback();
    hibaValasz(res, err);
  } finally {
    if (kapcsolat) kapcsolat.release();
  }
});

module.exports = router;