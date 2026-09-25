USE turistago;


-- =====================================================================
--  EGYTÁBLÁS LEKÉRDEZÉSEK (10 db)
-- =====================================================================

-- 1. Az összes felhasználó neve és e-mail címe
SELECT vezeteknev, keresztnev, email
FROM FELHASZNALO;

-- 2. A látványosságok neve ábécérendben
SELECT megnevezes
FROM LATVANYOSSAG
ORDER BY megnevezes;

-- 3. Az aktív bérletek
SELECT berlet_id, qr_kod, ervenyes_tol, ervenyes_ig
FROM BERLET
WHERE statusz = 'AKTIV';

-- 4. Az 5000 Ft-nál olcsóbb jegyek
SELECT jegy_nev, alap_ar
FROM JEGYTIPUS
WHERE alap_ar < 5000;

-- 5. A jegyek ár szerint csökkenő sorrendben
SELECT jegy_nev, alap_ar
FROM JEGYTIPUS
ORDER BY alap_ar DESC;

-- 6. A sikertelen fizetések
SELECT fizetes_id, vegosszeg, kiserlet_idopontja
FROM FIZETES
WHERE statusz = 'SIKERTELEN';

-- 7. Hány felhasználó van összesen?
SELECT COUNT(*) AS felhasznalok_szama
FROM FELHASZNALO;

-- 8. A legdrágább jegy ára
SELECT MAX(alap_ar) AS legdragabb_ar
FROM JEGYTIPUS;

-- 9. Az aktív turista csoportok
SELECT csoport_nev, letrehozas_ideje
FROM TURISTA_CSOPORT
WHERE statusz = 'AKTIV';

-- 10. A számlák bruttó összegének összege
SELECT SUM(brutto_osszeg) AS osszes_brutto
FROM SZAMLA;


-- =====================================================================
--  TÖBBTÁBLÁS LEKÉRDEZÉSEK (2 db)
-- =====================================================================

-- 11. Jegytípusok a hozzájuk tartozó látványosság nevével
SELECT j.jegy_nev, j.alap_ar, l.megnevezes AS latvanyossag
FROM JEGYTIPUS j
JOIN LATVANYOSSAG l ON l.latvanyossag_id = j.latvanyossag_id;

-- 12. Felhasználók a szerepkörükkel
SELECT f.vezeteknev, f.keresztnev, sz.megnevezes AS szerepkor
FROM FELHASZNALO f
JOIN SZEREPKOR sz ON sz.felhasznalo_id = f.felhasznalo_id;
