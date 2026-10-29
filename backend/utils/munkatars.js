// =====================================================================
//  utils/munkatars.js – felhasználó + beosztás felvétele egy tranzakcióban
//
//  Közös segédfüggvény:
//    - felhasznalo.js: fo_admin felvesz egy latvanyossag_admin-t
//    - beosztas.js:    latvanyossag_admin felvesz egy dolgozo-t
//
//  Ha a beosztás nem sikerül, a felhasználó sem jön létre (rollback).
// =====================================================================
const bcrypt = require("bcryptjs");
const pool = require("../db");

async function felhasznaloBeosztassal(adat, szerepkorNev, latvanyossagId) {
  const kapcsolat = await pool.getConnection();
  try {
    await kapcsolat.beginTransaction();

    const jelszoHash = await bcrypt.hash(adat.jelszo, 10);

    const [felhasz] = await kapcsolat.query(
      `INSERT INTO felhasznalo
         (szerepkor_id, vezeteknev, keresztnev, email, jelszo_hash, foto_url, lakcim)
       VALUES
         ((SELECT szerepkor_id FROM szerepkor WHERE megnevezes = ?), ?, ?, ?, ?, ?, ?)`,
      [
        szerepkorNev,
        adat.vezeteknev,
        adat.keresztnev,
        adat.email,
        jelszoHash,
        adat.foto_url || "alap_profilkep.svg",
        adat.lakcim,
      ]
    );

    const [beoszt] = await kapcsolat.query(
      "INSERT INTO beosztas (felhasznalo_id, latvanyossag_id) VALUES (?, ?)",
      [felhasz.insertId, latvanyossagId]
    );

    await kapcsolat.commit();
    return { felhasznalo_id: felhasz.insertId, beosztas_id: beoszt.insertId };
  } catch (err) {
    await kapcsolat.rollback();
    throw err;
  } finally {
    kapcsolat.release();
  }
}

module.exports = { felhasznaloBeosztassal };