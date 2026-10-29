// =====================================================================
//  utils/hiba.js – egységes hibaválasz a catch ágakhoz
//
//  try { ... } catch (err) { hibaValasz(res, err); }
//
//  A gyakori MySQL hibákat érthető státuszkódra fordítja,
//  minden mást 500-zal ad vissza (a részleteket csak a konzolra írja).
// =====================================================================

function hibaValasz(res, err) {
  switch (err && err.code) {
    case "ER_DUP_ENTRY":
      return res.status(409).json({ error: "Ilyen adat már létezik (pl. foglalt email)" });
    case "ER_NO_REFERENCED_ROW_2":
      return res.status(400).json({ error: "Hivatkozott rekord nem létezik" });
    case "ER_ROW_IS_REFERENCED_2":
      return res.status(409).json({ error: "A rekord nem törölhető, mert más adat hivatkozik rá" });
    case "ER_CHECK_CONSTRAINT_VIOLATED":
      return res.status(400).json({ error: "Az adat megsérti az adatbázis szabályait" });
    case "BARION_HIBA":
      console.error(err);
      return res.status(502).json({ error: "A Barion fizetési rendszer hibát jelzett" });
    default:
      console.error(err);
      return res.status(500).json({ error: "Szerverhiba" });
  }
}

module.exports = { hibaValasz };