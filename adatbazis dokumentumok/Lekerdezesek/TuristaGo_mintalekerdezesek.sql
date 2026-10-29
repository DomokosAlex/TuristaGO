SET NAMES utf8mb4 COLLATE utf8mb4_hungarian_ci;
USE `turistago`;


-- =====================================================================
--  A) EGYSZERŰ SELECT (egy tábla)
-- =====================================================================
-- 1. Egyszerű SELECT
SELECT megnevezes, tartozkodasi_cim
FROM latvanyossag;

-- 2. Szűrés + rendezés
SELECT terulet_megnevezes, terulet_ar
FROM latvanyossag_terulet
WHERE terulet_ar < 1500
ORDER BY terulet_ar DESC;

-- 3. Csoportosítás összesítő függvénnyel
SELECT latvanyossag_id,
       COUNT()                    AS terulet_db,
       ROUND(AVG(terulet_ar), 0)   AS atlagar
FROM latvanyossag_terulet
GROUP BY latvanyossag_id;

-- 4. Egy INNER JOIN
SELECT l.megnevezes         AS latvanyossag,
       t.terulet_megnevezes AS terulet,
       t.terulet_ar         AS ar
FROM latvanyossag l
INNER JOIN latvanyossag_terulet t
        ON t.latvanyossag_id = l.latvanyossag_id
ORDER BY l.megnevezes, t.terulet_ar DESC;

-- 5. Egy INNER JOIN + csoportosítás
SELECT l.megnevezes,
       n.kezdet_ora,
       n.vege_ora
FROM latvanyossag l
INNER JOIN nyitvatartas n
        ON n.latvanyossag_id = l.latvanyossag_id
WHERE n.nap_neve = 'Szombat'
  AND n.allapot  = 'nyitva';

-- 6. Két INNER JOIN – árlista kedvezményekkel
SELECT l.megnevezes         AS latvanyossag,
       t.terulet_megnevezes AS terulet,
       t.terulet_ar         AS alapar,
       k.kedvezmeny_nev     AS jegytipus,
       ROUND(t.terulet_ar (1 - k.kedvezmeny_merteke / 100), 0) AS fizetendo
FROM latvanyossag l
INNER JOIN latvanyossag_terulet t
        ON t.latvanyossag_id = l.latvanyossag_id
INNER JOIN kedvezmenytipus k
        ON k.latvanyossag_id = l.latvanyossag_id
ORDER BY l.megnevezes, t.terulet_megnevezes;