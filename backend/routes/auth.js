// =====================================================================
//  routes/auth.js
//
//  POST /api/auth/register   új felhasználó (mindig turista) + saját egyéni csoport
//  POST /api/auth/login      → { accessToken, refreshToken, user }
//  POST /api/auth/refresh    refreshToken → új accessToken
//  POST /api/auth/logout     refreshToken érvénytelenítése
//  GET  /api/auth/me         saját adatok (bejelentkezés kell)
// =====================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const auth = require("../middleware/auth");
const { hash, accessToken, refreshToken } = require("../utils/token");
const { hibaValasz } = require("../utils/hiba");

const router = express.Router();

// ---------- REGISZTRÁCIÓ ----------
// Body: { vezeteknev, keresztnev, email, jelszo, lakcim, preferalt_kedvezmeny? }
router.post("/register", async (req, res) => {
  const { vezeteknev, keresztnev, email, jelszo, lakcim, preferalt_kedvezmeny } = req.body || {};

  if (!vezeteknev || !keresztnev || !email || !jelszo || !lakcim) {
    return res.status(400).json({ error: "Hiányzó mezők" });
  }

  const [letezik] = await pool.query("SELECT 1 FROM felhasznalo WHERE email = ?", [email]);
  if (letezik.length) {
    return res.status(409).json({ error: "Ez az email már regisztrálva van" });
  }

  // A jelszót nem tároljuk, csak a hash-ét
  const jelszoHash = await bcrypt.hash(jelszo, 10);

  // Felhasználó + saját egyéni csoport egy tranzakcióban:
  // ha a csoport nem jön létre, a felhasználó sem (rollback)
  const kapcsolat = await pool.getConnection();
  try {
    await kapcsolat.beginTransaction();

    // Mindenki turistaként regisztrál (adminná csak egy admin tehet)
    const [eredmeny] = await kapcsolat.query(
      `INSERT INTO felhasznalo
         (szerepkor_id, vezeteknev, keresztnev, email, jelszo_hash, preferalt_kedvezmeny, lakcim)
       VALUES
         ((SELECT szerepkor_id FROM szerepkor WHERE megnevezes = 'turista'), ?, ?, ?, ?, ?, ?)`,
      [vezeteknev, keresztnev, email, jelszoHash, preferalt_kedvezmeny || null, lakcim]
    );

    // Az egyéni csoportot csak a regisztráció hozza létre (a POST /api/csoport nem)
    const [csoport] = await kapcsolat.query(
      "INSERT INTO csoport (vezeto_felhasznalo_id, csoport_nev, csoport_kategoria) VALUES (?, ?, 'egyeni')",
      [eredmeny.insertId, `${vezeteknev} ${keresztnev} - egyéni`.slice(0, 100)]
    );

    await kapcsolat.commit();
    res.status(201).json({ id: eredmeny.insertId, email, csoport_id: csoport.insertId });
  } catch (err) {
    await kapcsolat.rollback();
    hibaValasz(res, err);
  } finally {
    kapcsolat.release();
  }
});

// ---------- BELÉPÉS ----------
// Body: { email, jelszo }
router.post("/login", async (req, res) => {
  const { email, jelszo } = req.body || {};

  const [sorok] = await pool.query(
    `SELECT f.felhasznalo_id, f.vezeteknev, f.keresztnev, f.email, f.jelszo_hash,
            s.megnevezes AS szerepkor
       FROM felhasznalo f
       JOIN szerepkor s ON s.szerepkor_id = f.szerepkor_id
      WHERE f.email = ?`,
    [email]
  );
  const user = sorok[0];

  if (!user || !(await bcrypt.compare(jelszo || "", user.jelszo_hash))) {
    return res.status(401).json({ error: "Hibás email vagy jelszó" });
  }

  res.json({
    accessToken: accessToken(user.felhasznalo_id, user.szerepkor),
    refreshToken: await refreshToken(user.felhasznalo_id),
    user: {
      id: user.felhasznalo_id,
      vezeteknev: user.vezeteknev,
      keresztnev: user.keresztnev,
      email: user.email,
      szerepkor: user.szerepkor,
    },
  });
});

// ---------- ÚJ ACCESS TOKEN ----------
// Body: { refreshToken }
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};

  // 1. Jó az aláírás és nem járt le?
  let adat;
  try {
    adat = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: "Érvénytelen refresh token" });
  }

  // 2. Benne van az adatbázisban, és nincs visszavonva (kijelentkezve)?
  const [sorok] = await pool.query(
    `SELECT 1 FROM refresh_token
      WHERE token_hash = ? AND visszavonva = 0 AND lejarat > NOW()`,
    [hash(refreshToken)]
  );
  if (!sorok.length) {
    return res.status(401).json({ error: "A refresh token már nem érvényes" });
  }

  // 3. A szerepkört frissen olvassuk ki (lehet, hogy közben megváltozott)
  const [user] = await pool.query(
    `SELECT s.megnevezes AS szerepkor
       FROM felhasznalo f JOIN szerepkor s ON s.szerepkor_id = f.szerepkor_id
      WHERE f.felhasznalo_id = ?`,
    [adat.id]
  );
  if (!user.length) {
    return res.status(401).json({ error: "A felhasználó nem létezik" });
  }

  res.json({ accessToken: accessToken(adat.id, user[0].szerepkor) });
});

// ---------- KIJELENTKEZÉS ----------
// Body: { refreshToken }
// A refresh tokent a login menti el (utils/token.js → refreshToken() → INSERT INTO refresh_token).
// Itt csak visszavonjuk; ha egy sor sem változott, azt hibaként jelezzük.
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: "Hiányzó refreshToken" });
    }

    const [eredmeny] = await pool.query(
      "UPDATE refresh_token SET visszavonva = 1 WHERE token_hash = ? AND visszavonva = 0",
      [hash(refreshToken)]
    );
    if (eredmeny.affectedRows === 0) {
      return res.status(404).json({ error: "Nincs ilyen aktív refresh token (rossz token, vagy már kijelentkeztél)" });
    }

    res.json({ message: "Kijelentkezve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

module.exports = router;
