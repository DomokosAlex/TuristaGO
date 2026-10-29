// =====================================================================
//  routes/rendeles.js – Rendelések és a rendelés területei (turista)
//
//  POST   /api/rendeles                          új rendelés a csoporthoz        (vezető)
//  GET    /api/rendeles/:id                      rendelés + területek + összeg   (vezető, aktív tag)
//  DELETE /api/rendeles/:id                      rendelés törlése: 'torolt'      (vezető)
//  POST   /api/rendeles/:id/teruletek            terület hozzáadása              (vezető)
//  DELETE /api/rendeles/:id/teruletek/:teruletId terület eltávolítása            (vezető)
//
//  Szabályok:
//   - Csak a csoport vezetője rendelhet, és választhat látványosságot / területet.
//   - Egy csoportnak egyszerre csak EGY 'folyamatban' rendelése lehet.
//   - Csak 'folyamatban' rendelés módosítható, és csak akkor, ha nincs
//     megkezdett (le nem zárt) Barion fizetése – különben a kifizetett összeg
//     eltérne a rendelés összegétől.
//   - Az összeget minden módosításnál a szerver számolja újra (utils/osszeg.js).
//   - Fizetés: POST /api/fizetes/rendeles/:id (rendeles_fizetes.js).
// =====================================================================
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");
const { osszegFrissites } = require("../utils/osszeg");
const { nyitottFizetesVan, NYITOTT_STATUSZOK } = require("./rendeles_fizetes");

const router = express.Router();
router.use(auth, authorize("turista"));

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

function joId(ertek) {
  return Number.isInteger(Number(ertek)) && Number(ertek) > 0;
}

// A rendelés + csoport adatai (ha a csoport nem törölt), különben undefined
async function rendelesBetolt(db, rendelesId, zarolas = false) {
  const [sorok] = await db.query(
    `SELECT r.*, c.csoport_nev, c.vezeto_felhasznalo_id
       FROM rendeles r
       JOIN csoport c ON c.csoport_id = r.csoport_id
      WHERE r.rendeles_id = ? AND c.allapot <> 'torolt'
      ${zarolas ? "FOR UPDATE" : ""}`,
    [rendelesId]
  );
  return sorok[0];
}

// Van-e le nem zárt fizetési kísérlet az adatbázis szerint (Barion hívás nélkül)
async function nyitottFizetesDb(db, rendelesId) {
  const [sorok] = await db.query(
    "SELECT 1 FROM fizetes WHERE rendeles_id = ? AND statusz IN (?) LIMIT 1",
    [rendelesId, NYITOTT_STATUSZOK]
  );
  return sorok.length > 0;
}

// Közös ellenőrzés a módosító végpontokhoz.
// Hibánál { status, error }-t ad vissza, egyébként null-t.
async function modosithatoE(rendeles, felhasznaloId) {
  if (!rendeles) return { status: 404, error: "Nincs ilyen rendelés" };
  if (rendeles.vezeto_felhasznalo_id !== felhasznaloId) {
    return { status: 403, error: "Csak a csoport vezetője módosíthatja a rendelést" };
  }
  if (rendeles.allapot !== "folyamatban") {
    return { status: 409, error: "Csak folyamatban lévő rendelés módosítható" };
  }
  if (await nyitottFizetesVan(rendeles.rendeles_id)) {
    return {
      status: 409,
      error: "A rendeléshez fizetés van folyamatban – fejezd be, vagy várd meg a lejáratát (30 perc)",
    };
  }
  return null;
}

// ---------- ÚJ RENDELÉS (csak a vezető) ----------
// Body: { csoport_id }
router.post("/", async (req, res) => {
  try {
    const { csoport_id } = req.body || {};
    if (!joId(csoport_id)) return res.status(400).json({ error: "Hibás csoport azonosító" });

    const [csoportok] = await pool.query(
      "SELECT * FROM csoport WHERE csoport_id = ? AND allapot <> 'torolt'",
      [csoport_id]
    );
    const csoport = csoportok[0];
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a csoport vezetője rendelhet" });
    }
    if (csoport.allapot !== "aktiv") return res.status(409).json({ error: "A csoport archivált" });

    const [folyamatban] = await pool.query(
      "SELECT rendeles_id FROM rendeles WHERE csoport_id = ? AND allapot = 'folyamatban'",
      [csoport_id]
    );
    if (folyamatban.length) {
      return res.status(409).json({
        error: "A csoportnak már van folyamatban lévő rendelése",
        rendeles_id: folyamatban[0].rendeles_id,
      });
    }

    const [eredmeny] = await pool.query(
      "INSERT INTO rendeles (csoport_id, allapot, osszeg) VALUES (?, 'folyamatban', 0)",
      [csoport_id]
    );
    res.status(201).json({ rendeles_id: eredmeny.insertId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- EGY RENDELÉS: területek + összeg ----------
router.get("/:id", async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const rendeles = await rendelesBetolt(pool, req.params.id);
    if (!rendeles) return res.status(404).json({ error: "Nincs ilyen rendelés" });

    if (rendeles.vezeto_felhasznalo_id !== req.user.id) {
      const [tag] = await pool.query(
        `SELECT 1 FROM csoport_tagok
          WHERE csoport_id = ? AND felhasznalo_id = ? AND tag_allapot = 'aktiv'`,
        [rendeles.csoport_id, req.user.id]
      );
      if (!tag.length) return res.status(404).json({ error: "Nincs ilyen rendelés" });
    }

    // Folyamatban lévő rendelésnél (ha nincs megkezdett fizetés) az összeget frissítjük,
    // mert közben a csoport tagjai is változhattak
    if (rendeles.allapot === "folyamatban") {
      if (!(await nyitottFizetesDb(pool, rendeles.rendeles_id))) rendeles.osszeg = await osszegFrissites(pool, rendeles.rendeles_id);
    }

    const [teruletek] = await pool.query(
      `SELECT l.latvanyossag_id, l.megnevezes AS latvanyossag,
              t.terulet_id, t.terulet_megnevezes, t.terulet_ar
         FROM rendeles_teruletei rt
         JOIN latvanyossag_terulet t ON t.terulet_id      = rt.terulet_id
         JOIN latvanyossag         l ON l.latvanyossag_id = t.latvanyossag_id
        WHERE rt.rendeles_id = ?
        ORDER BY l.megnevezes, t.terulet_megnevezes`,
      [rendeles.rendeles_id]
    );

    res.json({
      rendeles_id: rendeles.rendeles_id,
      csoport_id: rendeles.csoport_id,
      csoport_nev: rendeles.csoport_nev,
      allapot: rendeles.allapot,
      osszeg: Number(rendeles.osszeg),
      teruletek,
    });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- RENDELÉS TÖRLÉSE (csak a vezető) ----------
// Nem törlünk: az állapot 'torolt' lesz. Kifizetett rendelés nem törölhető.
router.delete("/:id", async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const rendeles = await rendelesBetolt(pool, req.params.id);
    const hiba = await modosithatoE(rendeles, req.user.id);
    if (hiba) return res.status(hiba.status).json({ error: hiba.error });

    await pool.query(
      "UPDATE rendeles SET allapot = 'torolt' WHERE rendeles_id = ? AND allapot = 'folyamatban'",
      [rendeles.rendeles_id]
    );
    res.json({ message: "A rendelés törölve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- TERÜLET HOZZÁADÁSA (csak a vezető) ----------
// Body: { terulet_id }
router.post("/:id/teruletek", async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });
    const { terulet_id } = req.body || {};
    if (!joId(terulet_id)) return res.status(400).json({ error: "Hibás terület azonosító" });

    const hiba = await modosithatoE(await rendelesBetolt(pool, req.params.id), req.user.id);
    if (hiba) return res.status(hiba.status).json({ error: hiba.error });

    const [terulet] = await pool.query("SELECT 1 FROM latvanyossag_terulet WHERE terulet_id = ?", [terulet_id]);
    if (!terulet.length) return res.status(404).json({ error: "Nincs ilyen terület" });

    const kapcsolat = await pool.getConnection();
    try {
      await kapcsolat.beginTransaction();

      // Zárolás + újraellenőrzés: közben nem indulhatott el fizetés / nem változott az állapot
      const rendeles = await rendelesBetolt(kapcsolat, req.params.id, true);
      if (!rendeles || rendeles.allapot !== "folyamatban" || (await nyitottFizetesDb(kapcsolat, rendeles.rendeles_id))) {
        await kapcsolat.rollback();
        return res.status(409).json({ error: "A rendelés közben megváltozott vagy fizetés indult, próbáld újra" });
      }

      const [letezik] = await kapcsolat.query(
        "SELECT 1 FROM rendeles_teruletei WHERE rendeles_id = ? AND terulet_id = ?",
        [rendeles.rendeles_id, terulet_id]
      );
      if (letezik.length) {
        await kapcsolat.rollback();
        return res.status(409).json({ error: "Ez a terület már szerepel a rendelésben" });
      }

      await kapcsolat.query(
        "INSERT INTO rendeles_teruletei (rendeles_id, terulet_id) VALUES (?, ?)",
        [rendeles.rendeles_id, terulet_id]
      );
      const osszeg = await osszegFrissites(kapcsolat, rendeles.rendeles_id);

      await kapcsolat.commit();
      res.status(201).json({ rendeles_id: rendeles.rendeles_id, terulet_id: Number(terulet_id), osszeg });
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

// ---------- TERÜLET ELTÁVOLÍTÁSA (csak a vezető) ----------
router.delete("/:id/teruletek/:teruletId", async (req, res) => {
  try {
    if (!joId(req.params.id) || !joId(req.params.teruletId)) {
      return res.status(400).json({ error: "Hibás azonosító" });
    }

    const hiba = await modosithatoE(await rendelesBetolt(pool, req.params.id), req.user.id);
    if (hiba) return res.status(hiba.status).json({ error: hiba.error });

    const kapcsolat = await pool.getConnection();
    try {
      await kapcsolat.beginTransaction();

      const rendeles = await rendelesBetolt(kapcsolat, req.params.id, true);
      if (!rendeles || rendeles.allapot !== "folyamatban" || (await nyitottFizetesDb(kapcsolat, rendeles.rendeles_id))) {
        await kapcsolat.rollback();
        return res.status(409).json({ error: "A rendelés közben megváltozott vagy fizetés indult, próbáld újra" });
      }

      const [torles] = await kapcsolat.query(
        "DELETE FROM rendeles_teruletei WHERE rendeles_id = ? AND terulet_id = ?",
        [rendeles.rendeles_id, req.params.teruletId]
      );
      if (!torles.affectedRows) {
        await kapcsolat.rollback();
        return res.status(404).json({ error: "Ez a terület nem szerepel a rendelésben" });
      }

      const osszeg = await osszegFrissites(kapcsolat, rendeles.rendeles_id);

      await kapcsolat.commit();
      res.json({ rendeles_id: rendeles.rendeles_id, osszeg });
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

module.exports = router;
