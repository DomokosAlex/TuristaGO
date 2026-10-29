// =====================================================================
//  utils/token.js – tokenek készítése
//
//  ACCESS TOKEN  (15 perc): minden védett kérésnél ezt küldi a kliens:
//                           Authorization: Bearer <accessToken>
//                           Benne van: ki vagy (id) és mi a szerepköröd.
//
//  REFRESH TOKEN (7 nap):   csak arra jó, hogy lejárat után új access
//                           tokent kérj vele (POST /api/auth/refresh).
//                           Az adatbázisba is elmentjük, hogy kijelentkezéskor
//                           érvényteleníteni lehessen.
// =====================================================================
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

// Az adatbázisba nem a tokent, hanem a hash-ét mentjük
function hash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function accessToken(id, szerepkor) {
  return jwt.sign({ id, szerepkor }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

async function refreshToken(id) {
  const napok = Number(process.env.REFRESH_EXPIRES_DAYS);
  const token = jwt.sign({ id }, process.env.REFRESH_SECRET, {
    expiresIn: napok + "d",
    jwtid: crypto.randomUUID(), // így minden token egyedi
  });

  await pool.query(
    `INSERT INTO refresh_token (felhasznalo_id, token_hash, lejarat)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [id, hash(token), napok]
  );
  return token;
}

module.exports = { hash, accessToken, refreshToken };
