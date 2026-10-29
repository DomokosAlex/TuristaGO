//A Csoport létrehozásától
// A vezető, TAg, kapcsolat és a hozzá tartozó jogok kezelése. 
// Van lehetőség arra hogy a Vezető átruhháza  a vezetői szerépét eg tagra. 
//Ha a csoport megszünik (törölt-akkor csak az állapota változik az ENUM) lesz akkor a tagokat ki lesznek léptetve a csoportból. 
// de a többiek nem látják csak megmarad az adatbázisban 
// CSak a vezető tudja kiválasztani melyik Látványosságot és annak melyik területére mennek. / a tagok csak a kedvezménytpust tudják kiválasztani.(csak a tag)
//A vezető ki tudja léptetni a csoportból a tagot. (A tag saját maga is ki tud lépni. ) ez nem törlés hanem érték változás lesz.
//A vezető meghivásának az állapota is változik(elutasitotra ha viszutasitja)enum('aktiv', 'fuggoben', 'kilepett', 'elutasitott');
// a vezető joga a csoport nevének változtatása.
// csoport állapoi : enum('aktiv', 'archivalt', 'torolt')



// =====================================================================
//  routes/csoport.js - Csoportok, tagok, meghívók (turista)
//
//  GET    /api/csoport                          saját csoportjaim (vezető vagy aktív tag)
//  GET    /api/csoport/meghivok                 függőben lévő meghívóim
//  GET    /api/csoport/:id                      csoport adatai + tagok
//  POST   /api/csoport                          új csoport (a létrehozó a vezető)
//  PUT    /api/csoport/:id                      átnevezés                     (vezető)
//  PUT    /api/csoport/:id/archivalas           archiválás                    (vezető)
//  DELETE /api/csoport/:id                      megszüntetés: állapot 'torolt' (vezető, fo_admin)
//  POST   /api/csoport/:id/tagok                tag meghívása email alapján   (vezető)
//  DELETE /api/csoport/:id/tagok/:felhasznaloId tag kiléptetése               (vezető)
//  PUT    /api/csoport/:id/meghivo              meghívó elfogadása / elutasítása (meghívott)
//  PUT    /api/csoport/:id/kilepes              saját kilépés                 (tag)
//  PUT    /api/csoport/:id/vezeto               vezetői szerep átadása        (vezető)
//
//  Szabályok:
//   - A vezető NEM szerepel a csoport_tagok táblában (a csoport.vezeto_felhasznalo_id jelöli).
//   - Semmi nem törlődik: a csoport és a tagság csak állapotot vált.
//     Kivétel: vezetés átadásakor az új vezető csoport_tagok sora törlődik.
//   - A 'torolt' csoportot senki nem látja, de az adatbázisban megmarad.
//   - 'egyeni' csoportba nem lehet meghívni senkit.
//   - 'egyeni' csoportot csak a regisztráció hoz létre (auth.js), a POST csak 'csoportos'-t.
//   - Amíg a csoportnak ÉLŐ bérlete van, nem lehet új tagot felvenni.
//   - A vezető nem léphet ki: előbb átadja a vezetést vagy megszünteti a csoportot.
//   - A kedvezményt a felhasznalo.preferalt_kedvezmeny adja,
//     a látványosság/terület választás a rendeles_fizetes.js-ben van.
// =====================================================================
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { hibaValasz } = require("../utils/hiba");

const router = express.Router();

const KATEGORIAK = ["egyeni", "csoportos"];

router.use(auth);

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

function joId(ertek) {
  return Number.isInteger(Number(ertek)) && Number(ertek) > 0;
}

// A csoport (ha nem törölt), különben undefined
async function csoportBetolt(csoportId) {
  const [sorok] = await pool.query(
    "SELECT * FROM csoport WHERE csoport_id = ? AND allapot <> 'torolt'",
    [csoportId]
  );
  return sorok[0];
}

// A felhasználó tagsági állapota a csoportban (pl. 'aktiv'), vagy null
async function tagAllapot(csoportId, felhasznaloId) {
  const [sorok] = await pool.query(
    "SELECT tag_allapot FROM csoport_tagok WHERE csoport_id = ? AND felhasznalo_id = ?",
    [csoportId, felhasznaloId]
  );
  return sorok.length ? sorok[0].tag_allapot : null;
}

// Van-e a csoportnak éppen érvényes (élő) bérlete?
async function vanEloBerlet(csoportId) {
  const [sorok] = await pool.query(
    `SELECT 1
       FROM berlet b
       JOIN rendeles r ON r.rendeles_id = b.rendeles_id
      WHERE r.csoport_id = ?
        AND b.allapot <> 'lejart'
        AND NOW() BETWEEN b.ervenyes_kezdet AND b.ervenyes_vege
      LIMIT 1`,
    [csoportId]
  );
  return sorok.length > 0;
}

// ---------- SAJÁT CSOPORTJAIM ----------
router.get("/", authorize("turista"), async (req, res) => {
  try {
    const [sorok] = await pool.query(
      `SELECT c.csoport_id, c.csoport_nev, c.csoport_kategoria, c.allapot, c.letrehozva_datum,
              c.vezeto_felhasznalo_id,
              IF(c.vezeto_felhasznalo_id = ?, 'vezeto', 'tag') AS szerepem,
              (SELECT COUNT(*) FROM csoport_tagok t
                WHERE t.csoport_id = c.csoport_id AND t.tag_allapot = 'aktiv'
                  AND t.felhasznalo_id <> c.vezeto_felhasznalo_id) + 1 AS letszam
         FROM csoport c
        WHERE c.allapot <> 'torolt'
          AND (c.vezeto_felhasznalo_id = ?
               OR EXISTS (SELECT 1 FROM csoport_tagok t
                           WHERE t.csoport_id = c.csoport_id
                             AND t.felhasznalo_id = ? AND t.tag_allapot = 'aktiv'))
        ORDER BY c.letrehozva_datum DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- FÜGGŐBEN LÉVŐ MEGHÍVÓIM ----------
router.get("/meghivok", authorize("turista"), async (req, res) => {
  try {
    const [sorok] = await pool.query(
      `SELECT c.csoport_id, c.csoport_nev, c.csoport_kategoria,
              v.vezeteknev AS vezeto_vezeteknev, v.keresztnev AS vezeto_keresztnev
         FROM csoport_tagok t
         JOIN csoport c     ON c.csoport_id = t.csoport_id
         JOIN felhasznalo v ON v.felhasznalo_id = c.vezeto_felhasznalo_id
        WHERE t.felhasznalo_id = ? AND t.tag_allapot = 'fuggoben' AND c.allapot = 'aktiv'
        ORDER BY c.csoport_nev`,
      [req.user.id]
    );
    res.json(sorok);
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- EGY CSOPORT + TAGOK ----------
// A vezető minden tagot lát (minden állapottal), a tag csak az aktív tagokat.
router.get("/:id", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });

    const vezeto = csoport.vezeto_felhasznalo_id === req.user.id;
    if (!vezeto && (await tagAllapot(csoport.csoport_id, req.user.id)) !== "aktiv") {
      return res.status(403).json({ error: "Nem vagy tagja ennek a csoportnak" });
    }

    const [vezetoAdat] = await pool.query(
      `SELECT felhasznalo_id, vezeteknev, keresztnev, email, preferalt_kedvezmeny
         FROM felhasznalo WHERE felhasznalo_id = ?`,
      [csoport.vezeto_felhasznalo_id]
    );

    const [tagok] = await pool.query(
      `SELECT f.felhasznalo_id, f.vezeteknev, f.keresztnev, f.email, f.preferalt_kedvezmeny,
              t.tag_allapot, t.csatlakozasi_ido
         FROM csoport_tagok t
         JOIN felhasznalo f ON f.felhasznalo_id = t.felhasznalo_id
        WHERE t.csoport_id = ?
          AND t.felhasznalo_id <> ?
          AND (? OR t.tag_allapot = 'aktiv')
        ORDER BY t.tag_allapot, f.vezeteknev, f.keresztnev`,
      [csoport.csoport_id, csoport.vezeto_felhasznalo_id, vezeto]
    );

    res.json({ ...csoport, szerepem: vezeto ? "vezeto" : "tag", vezeto: vezetoAdat[0], tagok });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- ÚJ CSOPORT ----------
// Body: { csoport_nev, csoport_kategoria? (csak 'csoportos' lehet, ez az alap) }
// Az egyéni csoportot a regisztráció hozza létre (auth.js), kézzel nem lehet.
router.post("/", authorize("turista"), async (req, res) => {
  try {
    const { csoport_nev, csoport_kategoria } = req.body || {};

    if (!csoport_nev || !csoport_nev.trim()) {
      return res.status(400).json({ error: "Hiányzik a csoport neve" });
    }
    if (csoport_nev.length > 100) {
      return res.status(400).json({ error: "A csoport neve legfeljebb 100 karakter lehet" });
    }
    if (csoport_kategoria === "egyeni") {
      return res.status(403).json({ error: "Egyéni csoportot nem lehet létrehozni, a regisztrációkor automatikusan készül" });
    }
    if (csoport_kategoria && !KATEGORIAK.includes(csoport_kategoria)) {
      return res.status(400).json({ error: "Érvénytelen kategória (csak csoportos)" });
    }

    const [eredmeny] = await pool.query(
      "INSERT INTO csoport (vezeto_felhasznalo_id, csoport_nev, csoport_kategoria) VALUES (?, ?, 'csoportos')",
      [req.user.id, csoport_nev.trim()]
    );
    res.status(201).json({ csoport_id: eredmeny.insertId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- ÁTNEVEZÉS (vezető) ----------
// Body: { csoport_nev }
router.put("/:id", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const { csoport_nev } = req.body || {};
    if (!csoport_nev || !csoport_nev.trim()) {
      return res.status(400).json({ error: "Hiányzik a csoport neve" });
    }
    if (csoport_nev.length > 100) {
      return res.status(400).json({ error: "A csoport neve legfeljebb 100 karakter lehet" });
    }

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető nevezheti át a csoportot" });
    }
    if (csoport.allapot !== "aktiv") return res.status(409).json({ error: "Az archivált csoport nem módosítható" });

    await pool.query("UPDATE csoport SET csoport_nev = ? WHERE csoport_id = ?", [
      csoport_nev.trim(),
      csoport.csoport_id,
    ]);
    res.json({ message: "Átnevezve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- ARCHIVÁLÁS (vezető) ----------
router.put("/:id/archivalas", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető archiválhatja a csoportot" });
    }
    if (csoport.allapot === "archivalt") return res.status(409).json({ error: "A csoport már archivált" });

    await pool.query("UPDATE csoport SET allapot = 'archivalt' WHERE csoport_id = ?", [csoport.csoport_id]);
    res.json({ message: "Archiválva" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- MEGSZÜNTETÉS (vezető vagy fo_admin) ----------
// Nem valódi törlés: a csoport 'torolt' lesz, a tagok és a függő meghívók 'kilepett'-re állnak.
router.delete("/:id", authorize("turista", "fo_admin"), async (req, res) => {
  if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

  let kapcsolat;
  try {
    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (req.user.szerepkor !== "fo_admin" && csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető szüntetheti meg a csoportot" });
    }

    kapcsolat = await pool.getConnection();
    await kapcsolat.beginTransaction();

    await kapcsolat.query("UPDATE csoport SET allapot = 'torolt' WHERE csoport_id = ?", [csoport.csoport_id]);
    const [kileptetett] = await kapcsolat.query(
      `UPDATE csoport_tagok SET tag_allapot = 'kilepett'
        WHERE csoport_id = ? AND tag_allapot IN ('aktiv', 'fuggoben')`,
      [csoport.csoport_id]
    );

    await kapcsolat.commit();
    res.json({ message: "A csoport megszűnt", kileptetett_tagok: kileptetett.affectedRows });
  } catch (err) {
    if (kapcsolat) await kapcsolat.rollback();
    hibaValasz(res, err);
  } finally {
    if (kapcsolat) kapcsolat.release();
  }
});

// ---------- TAG MEGHÍVÁSA (vezető) ----------
// Body: { email }
// Ha a felhasználó korábban kilépett / elutasított, a meglévő sor újra 'fuggoben' lesz.
router.post("/:id/tagok", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const { email } = req.body || {};
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Érvényes email cím kell" });
    }

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető hívhat meg tagot" });
    }
    if (csoport.allapot !== "aktiv") return res.status(409).json({ error: "Az archivált csoportba nem lehet meghívni" });
    if (csoport.csoport_kategoria === "egyeni") {
      return res.status(409).json({ error: "Egyéni csoportba nem lehet tagot meghívni" });
    }
    if (await vanEloBerlet(csoport.csoport_id)) {
      return res.status(409).json({ error: "Amíg a csoport bérlete érvényes, nem vehető fel új tag" });
    }

    const [meghivott] = await pool.query(
      `SELECT f.felhasznalo_id
         FROM felhasznalo f JOIN szerepkor s ON s.szerepkor_id = f.szerepkor_id
        WHERE f.email = ? AND s.megnevezes = 'turista'`,
      [email]
    );
    if (!meghivott.length) return res.status(404).json({ error: "Nincs ilyen email című turista" });

    const meghivottId = meghivott[0].felhasznalo_id;
    if (meghivottId === csoport.vezeto_felhasznalo_id) {
      return res.status(400).json({ error: "A vezetőt nem lehet tagként meghívni" });
    }

    const allapot = await tagAllapot(csoport.csoport_id, meghivottId);
    if (allapot === "aktiv") return res.status(409).json({ error: "Már a csoport tagja" });
    if (allapot === "fuggoben") return res.status(409).json({ error: "Már meg van hívva" });

    if (allapot) {
      // korábban kilépett vagy elutasított → újrameghívás
      await pool.query(
        `UPDATE csoport_tagok SET tag_allapot = 'fuggoben', csatlakozasi_ido = NULL
          WHERE csoport_id = ? AND felhasznalo_id = ?`,
        [csoport.csoport_id, meghivottId]
      );
    } else {
      await pool.query("INSERT INTO csoport_tagok (csoport_id, felhasznalo_id) VALUES (?, ?)", [
        csoport.csoport_id,
        meghivottId,
      ]);
    }
    res.status(201).json({ message: "Meghívó elküldve", felhasznalo_id: meghivottId });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- TAG KILÉPTETÉSE (vezető) ----------
// Nem törlés: a tag (vagy a függő meghívó) 'kilepett' lesz.
router.delete("/:id/tagok/:felhasznaloId", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id) || !joId(req.params.felhasznaloId)) {
      return res.status(400).json({ error: "Hibás azonosító" });
    }

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető léptethet ki tagot" });
    }
    if (Number(req.params.felhasznaloId) === req.user.id) {
      return res.status(400).json({ error: "Saját magadat nem léptetheted ki, add át a vezetést" });
    }

    const [eredmeny] = await pool.query(
      `UPDATE csoport_tagok SET tag_allapot = 'kilepett'
        WHERE csoport_id = ? AND felhasznalo_id = ? AND tag_allapot IN ('aktiv', 'fuggoben')`,
      [csoport.csoport_id, req.params.felhasznaloId]
    );
    if (eredmeny.affectedRows === 0) return res.status(404).json({ error: "Nincs ilyen aktív tag vagy meghívott" });
    res.json({ message: "Kiléptetve" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- MEGHÍVÓ ELFOGADÁSA / ELUTASÍTÁSA (meghívott) ----------
// Body: { valasz: 'elfogad' | 'elutasit' }
router.put("/:id/meghivo", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const { valasz } = req.body || {};
    if (valasz !== "elfogad" && valasz !== "elutasit") {
      return res.status(400).json({ error: "A valasz értéke 'elfogad' vagy 'elutasit' lehet" });
    }

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport || csoport.allapot !== "aktiv") return res.status(404).json({ error: "Nincs ilyen aktív csoport" });

    if ((await tagAllapot(csoport.csoport_id, req.user.id)) !== "fuggoben") {
      return res.status(404).json({ error: "Nincs függőben lévő meghívód ebbe a csoportba" });
    }

    if (valasz === "elutasit") {
      await pool.query(
        "UPDATE csoport_tagok SET tag_allapot = 'elutasitott' WHERE csoport_id = ? AND felhasznalo_id = ?",
        [csoport.csoport_id, req.user.id]
      );
      return res.json({ message: "Meghívó elutasítva" });
    }

    if (await vanEloBerlet(csoport.csoport_id)) {
      return res.status(409).json({ error: "Amíg a csoport bérlete érvényes, nem lehet csatlakozni" });
    }

    await pool.query(
      `UPDATE csoport_tagok SET tag_allapot = 'aktiv', csatlakozasi_ido = NOW()
        WHERE csoport_id = ? AND felhasznalo_id = ?`,
      [csoport.csoport_id, req.user.id]
    );
    res.json({ message: "Csatlakoztál a csoporthoz" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- SAJÁT KILÉPÉS (tag) ----------
// Nem törlés: 'kilepett' lesz. A csoport bérletét ezután nem használhatja.
router.put("/:id/kilepes", authorize("turista"), async (req, res) => {
  try {
    if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id === req.user.id) {
      return res.status(409).json({ error: "A vezető nem léphet ki: előbb add át a vezetést vagy szüntesd meg a csoportot" });
    }

    const [eredmeny] = await pool.query(
      `UPDATE csoport_tagok SET tag_allapot = 'kilepett'
        WHERE csoport_id = ? AND felhasznalo_id = ? AND tag_allapot = 'aktiv'`,
      [csoport.csoport_id, req.user.id]
    );
    if (eredmeny.affectedRows === 0) return res.status(404).json({ error: "Nem vagy aktív tagja ennek a csoportnak" });
    res.json({ message: "Kiléptél a csoportból" });
  } catch (err) {
    hibaValasz(res, err);
  }
});

// ---------- VEZETŐI SZEREP ÁTADÁSA (vezető) ----------
// Body: { uj_vezeto_id }  – csak aktív tagnak adható át.
// A régi vezető aktív tagként marad a csoportban, az új vezető tagsági sora
// törlődik (a vezetőt a csoport.vezeto_felhasznalo_id jelöli).
router.put("/:id/vezeto", authorize("turista"), async (req, res) => {
  if (!joId(req.params.id)) return res.status(400).json({ error: "Hibás azonosító" });

  const { uj_vezeto_id } = req.body || {};
  if (!joId(uj_vezeto_id)) return res.status(400).json({ error: "Hiányzó vagy hibás uj_vezeto_id" });

  let kapcsolat;
  try {
    const csoport = await csoportBetolt(req.params.id);
    if (!csoport) return res.status(404).json({ error: "Nincs ilyen csoport" });
    if (csoport.vezeto_felhasznalo_id !== req.user.id) {
      return res.status(403).json({ error: "Csak a vezető adhatja át a vezetést" });
    }
    if (csoport.allapot !== "aktiv") return res.status(409).json({ error: "Az archivált csoport nem módosítható" });
    if ((await tagAllapot(csoport.csoport_id, uj_vezeto_id)) !== "aktiv") {
      return res.status(400).json({ error: "Csak aktív tagnak adható át a vezetés" });
    }

    kapcsolat = await pool.getConnection();
    await kapcsolat.beginTransaction();

    // A WHERE a régi vezetőt is ellenőrzi: két egyszerre érkező átadás közül csak egy sikerül
    const [atadas] = await kapcsolat.query(
      "UPDATE csoport SET vezeto_felhasznalo_id = ? WHERE csoport_id = ? AND vezeto_felhasznalo_id = ?",
      [uj_vezeto_id, csoport.csoport_id, req.user.id]
    );
    if (!atadas.affectedRows) {
      await kapcsolat.rollback();
      return res.status(409).json({ error: "A csoport vezetője közben megváltozott" });
    }

    // Az új vezető tagsága törlődik: a vezető NEM szerepel a csoport_tagok táblában
    await kapcsolat.query("DELETE FROM csoport_tagok WHERE csoport_id = ? AND felhasznalo_id = ?", [
      csoport.csoport_id,
      uj_vezeto_id,
    ]);

    // A régi vezető aktív tag lesz. Ha még nincs sora, a csoport létrehozásától számít tagnak.
    await kapcsolat.query(
      `INSERT INTO csoport_tagok (csoport_id, felhasznalo_id, csatlakozasi_ido, tag_allapot)
       VALUES (?, ?, ?, 'aktiv')
       ON DUPLICATE KEY UPDATE tag_allapot = 'aktiv'`,
      [csoport.csoport_id, req.user.id, csoport.letrehozva_datum]
    );

    await kapcsolat.commit();
    res.json({ message: "A vezetés átadva", uj_vezeto_id: Number(uj_vezeto_id) });
  } catch (err) {
    if (kapcsolat) await kapcsolat.rollback();
    hibaValasz(res, err);
  } finally {
    if (kapcsolat) kapcsolat.release();
  }
});

module.exports = router;