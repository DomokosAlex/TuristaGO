// =====================================================================
//  routes/felhasznalo.js
//
//  GET    /api/felhasznalo                               fo_admin – felhasználók listája
//  GET    /api/felhasznalo/profil                        bejelentkezett – saját adatok
//  PUT    /api/felhasznalo/profil                        bejelentkezett – saját adatok módosítása
//  POST   /api/felhasznalo/felvetel/latvanyossag-admin   fo_admin – látványosság admin + beosztás
//  DELETE /api/felhasznalo/torles/:id                    fo_admin – törlés (beosztás lezárva marad)
//
//  A dolgozók felvétele / kezelése a routes/beosztas.js-ben van.
// =====================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");
const { felhasznaloBeosztassal } = require("../utils/munkatars");

const router = express.Router();

const KEDVEZMENYEK = ["Felnőtt", "Diák", "Szociális"];

// ---------- LISTA (csak fo_admin) ----------
// Query (opcionális): ?szerepkor=dolgozo
router.get("/", auth, authorize("fo_admin"), async (req, res) => {
  try {
    const szerepkor = req.query.szerepkor || null;

    const [sorok] = await pool.query(
      `SELECT f.felhasznalo_id, f.vezeteknev, f.keresztnev, f.email, f.lakcim,
              f.regisztracio_ideje, s.megnevezes AS szerepkor,
              b.latvanyossag_id, l.megnevezes AS latvanyossag
         FROM felhasznalo f
         JOIN szerepkor s ON s.szerepkor_id = f.szerepkor_id
         LEFT JOIN beosztas b ON b.felhasznalo_id = f.felhasznalo_id AND b.kilepett_datum IS NULL
         LEFT JOIN latvanyossag l ON l.latvanyossag_id = b.latvanyossag_id
        WHERE (? IS NULL OR s.megnevezes = ?)
        ORDER BY f.vezeteknev, f.keresztnev`,
      [szerepkor, szerepkor]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- SAJÁT ADATOK (védett) ----------
router.get("/profil", auth, async (req, res) => {
  try {
    const [sorok] = await pool.query(
      `SELECT f.felhasznalo_id, f.vezeteknev, f.keresztnev, f.email, f.lakcim,
              f.foto_url, f.preferalt_kedvezmeny, f.regisztracio_ideje,
              s.megnevezes AS szerepkor
         FROM felhasznalo f
         JOIN szerepkor s ON s.szerepkor_id = f.szerepkor_id
        WHERE f.felhasznalo_id = ?`,
      [req.user.id] // az id a tokenből jön
    );
    if (!sorok.length) return res.status(404).json({ error: "Nincs ilyen felhasználó" });
    res.json(sorok[0]);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- SAJÁT ADATOK MÓDOSÍTÁSA ----------
// Body: { vezeteknev, keresztnev, email, lakcim, foto_url?, preferalt_kedvezmeny?, jelszo? }
// A jelszó csak akkor változik, ha megadják.
router.put("/profil", auth, async (req, res) => {
  try {
    const { vezeteknev, keresztnev, email, lakcim, foto_url, preferalt_kedvezmeny, jelszo } = req.body || {};

    if (!vezeteknev || !keresztnev || !email || !lakcim) {
      return res.status(400).json({ error: "Hiányzó mezők" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Érvénytelen email cím" });
    }
    if (preferalt_kedvezmeny && !KEDVEZMENYEK.includes(preferalt_kedvezmeny)) {
      return res.status(400).json({ error: "Érvénytelen kedvezmény (Felnőtt, Diák, Szociális)" });
    }
    if (jelszo && jelszo.length < 6) {
      return res.status(400).json({ error: "A jelszó legalább 6 karakter legyen" });
    }

    const jelszoHash = jelszo ? await bcrypt.hash(jelszo, 10) : null;

    const [eredmeny] = await pool.query(
      `UPDATE felhasznalo
          SET vezeteknev = ?, keresztnev = ?, email = ?, lakcim = ?,
              foto_url = COALESCE(?, foto_url),
              preferalt_kedvezmeny = ?,
              jelszo_hash = COALESCE(?, jelszo_hash)
        WHERE felhasznalo_id = ?`,
      [vezeteknev, keresztnev, email, lakcim, foto_url || null, preferalt_kedvezmeny || null, jelszoHash, req.user.id]
    );
    if (eredmeny.affectedRows === 0) return res.status(404).json({ error: "Nincs ilyen felhasználó" });
    res.json({ message: "Módosítva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- FŐ ADMIN: LÁTVÁNYOSSÁG ADMIN FELVÉTELE + BEOSZTÁS ----------
// Body: { vezeteknev, keresztnev, email, jelszo, lakcim, foto_url?, latvanyossag_id }
router.post("/felvetel/latvanyossag-admin", auth, authorize("fo_admin"), async (req, res) => {
  try {
    const { vezeteknev, keresztnev, email, jelszo, lakcim, latvanyossag_id } = req.body || {};

    if (!vezeteknev || !keresztnev || !email || !jelszo || !lakcim || !latvanyossag_id) {
      return res.status(400).json({ error: "Hiányzó mezők" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Érvénytelen email cím" });
    }
    if (jelszo.length < 6) {
      return res.status(400).json({ error: "A jelszó legalább 6 karakter legyen" });
    }
    if (!Number.isInteger(Number(latvanyossag_id))) {
      return res.status(400).json({ error: "Hibás látványosság azonosító" });
    }

    const [latv] = await pool.query("SELECT 1 FROM latvanyossag WHERE latvanyossag_id = ?", [latvanyossag_id]);
    if (!latv.length) return res.status(404).json({ error: "Nincs ilyen látványosság" });

    const eredmeny = await felhasznaloBeosztassal(req.body, "latvanyossag_admin", latvanyossag_id);
    res.status(201).json(eredmeny);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- TÖRLÉS (csak fo_admin) ----------
// A beosztás NEM törlődik: kilépési dátumot kap, a felhasználó törlődik.
// (A migracio_beosztas.sql után a beosztas.felhasznalo_id NULL-ra áll.)
router.delete("/torles/:id", auth, authorize("fo_admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Hibás azonosító" });
  if (id === req.user.id) return res.status(400).json({ error: "Saját magadat nem törölheted" });

  let kapcsolat;
  try {
    kapcsolat = await pool.getConnection();
    await kapcsolat.beginTransaction();

    const [lezart] = await kapcsolat.query(
      "UPDATE beosztas SET kilepett_datum = NOW() WHERE felhasznalo_id = ? AND kilepett_datum IS NULL",
      [id]
    );

    const [eredmeny] = await kapcsolat.query("DELETE FROM felhasznalo WHERE felhasznalo_id = ?", [id]);
    if (eredmeny.affectedRows === 0) {
      await kapcsolat.rollback();
      return res.status(404).json({ error: "Nincs ilyen felhasználó" });
    }

    await kapcsolat.commit();
    res.json({ message: "Törölve", lezart_beosztasok: lezart.affectedRows });
  } catch (err) {
    if (kapcsolat) await kapcsolat.rollback();
    hibaValasz(res, err);
  } finally {
    if (kapcsolat) kapcsolat.release();
  }
});

module.exports = router;