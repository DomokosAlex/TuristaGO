

SET NAMES utf8mb4 COLLATE utf8mb4_hungarian_ci;
USE `turistago`;


-- ---------------------------------------------------------------------
--  SZEREPKOR
-- ---------------------------------------------------------------------
INSERT INTO `szerepkor` (`szerepkor_id`, `megnevezes`) VALUES
(1, 'turista'),
(2, 'dolgozo'),
(3, 'fo_admin'),
(4, 'latvanyossag_admin');

-- ---------------------------------------------------------------------
--  LATVANYOSSAG   (kitalált, szemléltető látványosságok a szatmári tájról)
-- ---------------------------------------------------------------------
INSERT INTO `latvanyossag` (`latvanyossag_id`, `megnevezes`, `tartozkodasi_cim`, `leiras`) VALUES
(1, 'Tarpai Tájház és Kiállítás',        '4941 Tarpa, Kossuth utca 12.',
    'A szatmári falu hagyományos életét bemutató tájház, állandó kiállítással, gyerekfoglalkoztatóval és kovácsműhely-bemutatóval.'),
(2, 'Szamosháti Malom Élménypark',       '4764 Túristvándi, Szabadság út 5.',
    'Működő vízimalom gépházzal és vezetett túrákkal, ahol a lisztőrlés teljes folyamata megismerhető.'),
(3, 'Fehérgyarmati Várkert Kalandpark',  '4900 Fehérgyarmat, Május 14. tér 3.',
    'Családbarát kalandpark kötélpályákkal, kilátóval és mini állatsimogatóval a város szívében.'),
(4, 'Kölcsei Szabadtéri Néprajzi Gyűjtemény', '4945 Kölcse, Himnusz utca 1.',
    'Áttelepített népi építészeti emlékek és működő kézműves udvar a Szatmár-vidék hagyományaiból.'),
(5, 'Szamos-menti Tanösvény',            '4931 Szamosújlak, Szamos-part 0.',
    'Kényelmes sétaútvonal a folyó mentén, madármegfigyelő toronnyal és ismertető táblákkal.');

-- ---------------------------------------------------------------------
--  KEDVEZMENYTIPUS   (kedvezmeny_merteke = százalék)
-- ---------------------------------------------------------------------
INSERT INTO `kedvezmenytipus` (`kedvezmeny_id`, `latvanyossag_id`, `kedvezmeny_nev`, `kedvezmeny_merteke`) VALUES
( 1, 1, 'Felnőtt',   0.00), ( 2, 1, 'Diák', 50.00), ( 3, 1, 'Szociális', 30.00),
( 4, 2, 'Felnőtt',   0.00), ( 5, 2, 'Diák', 50.00), ( 6, 2, 'Szociális', 30.00),
( 7, 3, 'Felnőtt',   0.00), ( 8, 3, 'Diák', 40.00), ( 9, 3, 'Szociális', 25.00),
(10, 4, 'Felnőtt',   0.00), (11, 4, 'Diák', 50.00), (12, 4, 'Szociális', 30.00),
(13, 5, 'Felnőtt',   0.00), (14, 5, 'Diák', 50.00), (15, 5, 'Szociális', 50.00);

-- ---------------------------------------------------------------------
--  LATVANYOSSAG_TERULET
-- ---------------------------------------------------------------------
INSERT INTO `latvanyossag_terulet`
    (`terulet_id`, `latvanyossag_id`, `terulet_megnevezes`, `terulet_leiras`, `terulet_ar`)
VALUES
( 1, 1, 'Állandó kiállítás',          'A régi szatmári paraszti élet tárgyai, viseletek és használati eszközök.', 1200.00),
( 2, 1, 'Gyerek foglalkoztató szoba', 'Interaktív játékok és kézműves foglalkozások a legkisebbeknek.',             800.00),
( 3, 1, 'Kovácsműhely-bemutató',      'Élő kovácsmesterség-bemutató, kipróbálási lehetőséggel.',                  1000.00),
( 4, 2, 'Malomépület és gépház',      'A felújított malomépület, a vízikerék és az őrlőgépek megtekintése.',      1800.00),
( 5, 2, 'Vezetett malomtúra',         'Szakvezetéssel, liszt-kóstolóval egybekötött túra.',                       2500.00),
( 6, 3, 'Kalandpark pálya',           'Kötélpálya és akadályok különböző nehézségi szinteken.',                   3200.00),
( 7, 3, 'Kilátó',                     'Panorámás kilátó a város és a Szamos-völgy fölött.',                        900.00),
( 8, 3, 'Mini állatsimogató',         'Háziállatok simogatása, etetése gondozói felügyelettel.',                  1100.00),
( 9, 4, 'Szabadtéri skanzen',         'Áttelepített parasztházak és gazdasági épületek kerti sétával.',           1500.00),
(10, 4, 'Kézműves udvar',             'Fazekas-, szövő- és fafaragó műhelyek, kipróbálható mesterségek.',         1300.00),
(11, 5, 'Teljes tanösvény',           'A teljes, kb. 4 km hosszú ismeretterjesztő sétaút.',                        700.00),
(12, 5, 'Madármegfigyelő torony',     'Kilátótorony a folyó menti madárvilág megfigyeléséhez.',                    600.00);

-- ---------------------------------------------------------------------
--  LATVANYOSSAG_KEP
-- ---------------------------------------------------------------------
INSERT INTO `latvanyossag_kep` (`kep_id`, `latvanyossag_id`, `kep_url`) VALUES
(1, 1, 'kepek/tarpai_tajhaz_01.jpg'),
(2, 1, 'kepek/tarpai_tajhaz_02.jpg'),
(3, 2, 'kepek/szamoshati_malom_01.jpg'),
(4, 2, 'kepek/szamoshati_malom_02.jpg'),
(5, 3, 'kepek/varkert_kalandpark_01.jpg'),
(6, 3, 'kepek/varkert_kalandpark_02.jpg'),
(7, 4, 'kepek/kolcsei_skanzen_01.jpg'),
(8, 4, 'kepek/kolcsei_skanzen_02.jpg'),
(9, 5, 'kepek/szamos_tanosveny_01.jpg'),
(10,5, 'kepek/szamos_tanosveny_02.jpg');

-- ---------------------------------------------------------------------
--  ZARVA_TARTAS
-- ---------------------------------------------------------------------
INSERT INTO `zarva_tartas` (`zarvatartas_id`, `latvanyossag_id`, `kezdo_datum`, `vege_datum`, `indok`) VALUES
(1, 1, '2026-12-24 00:00:00', '2027-01-01 23:59:59', 'Téli szünet'),
(2, 2, '2026-11-02 00:00:00', '2026-11-15 23:59:59', 'Gépészeti karbantartás'),
(3, 3, '2026-12-24 00:00:00', '2026-12-26 23:59:59', 'Ünnepi zárás'),
(4, 5, '2026-10-12 00:00:00', '2026-10-14 23:59:59', 'Áradás miatti ideiglenes zárás'),
(5, 4, '2026-11-15 00:00:00', '2027-03-14 23:59:59', 'Téli szezonális szünet'),
(6, 3, '2026-11-20 00:00:00', '2026-11-20 23:59:59', NULL);

INSERT INTO `nyitvatartas`
    (`nyitvatartas_id`, `latvanyossag_id`, `nap_neve`, `kezdet_ora`, `vege_ora`, `allapot`)
VALUES
-- 1: Tarpai Tájház
( 1, 1, 'Hétfő',     NULL,       NULL,       'zárva'),
( 2, 1, 'Kedd',      '09:00:00', '17:00:00', 'nyitva'),
( 3, 1, 'Szerda',    '09:00:00', '17:00:00', 'nyitva'),
( 4, 1, 'Csütörtök', '09:00:00', '17:00:00', 'nyitva'),
( 5, 1, 'Péntek',    '09:00:00', '17:00:00', 'nyitva'),
( 6, 1, 'Szombat',   '09:00:00', '18:00:00', 'nyitva'),
( 7, 1, 'Vasárnap',  '10:00:00', '16:00:00', 'nyitva'),
-- 2: Malom Élménypark
( 8, 2, 'Hétfő',     NULL,       NULL,       'zárva'),
( 9, 2, 'Kedd',      '10:00:00', '18:00:00', 'nyitva'),
(10, 2, 'Szerda',    '10:00:00', '18:00:00', 'nyitva'),
(11, 2, 'Csütörtök', '10:00:00', '18:00:00', 'nyitva'),
(12, 2, 'Péntek',    '10:00:00', '18:00:00', 'nyitva'),
(13, 2, 'Szombat',   '10:00:00', '19:00:00', 'nyitva'),
(14, 2, 'Vasárnap',  '10:00:00', '19:00:00', 'nyitva'),
-- 3: Várkert Kalandpark
(15, 3, 'Hétfő',     '09:00:00', '18:00:00', 'nyitva'),
(16, 3, 'Kedd',      '09:00:00', '18:00:00', 'nyitva'),
(17, 3, 'Szerda',    '09:00:00', '18:00:00', 'nyitva'),
(18, 3, 'Csütörtök', '09:00:00', '18:00:00', 'nyitva'),
(19, 3, 'Péntek',    '09:00:00', '18:00:00', 'nyitva'),
(20, 3, 'Szombat',   '09:00:00', '20:00:00', 'nyitva'),
(21, 3, 'Vasárnap',  '09:00:00', '20:00:00', 'nyitva'),
-- 4: Néprajzi Gyűjtemény
(22, 4, 'Hétfő',     NULL,       NULL,       'zárva'),
(23, 4, 'Kedd',      NULL,       NULL,       'zárva'),
(24, 4, 'Szerda',    '10:00:00', '17:00:00', 'nyitva'),
(25, 4, 'Csütörtök', '10:00:00', '17:00:00', 'nyitva'),
(26, 4, 'Péntek',    '10:00:00', '17:00:00', 'nyitva'),
(27, 4, 'Szombat',   '10:00:00', '17:00:00', 'nyitva'),
(28, 4, 'Vasárnap',  '10:00:00', '17:00:00', 'nyitva'),
-- 5: Tanösvény (minden nap)
(29, 5, 'Hétfő',     '08:00:00', '19:00:00', 'nyitva'),
(30, 5, 'Kedd',      '08:00:00', '19:00:00', 'nyitva'),
(31, 5, 'Szerda',    '08:00:00', '19:00:00', 'nyitva'),
(32, 5, 'Csütörtök', '08:00:00', '19:00:00', 'nyitva'),
(33, 5, 'Péntek',    '08:00:00', '19:00:00', 'nyitva'),
(34, 5, 'Szombat',   '08:00:00', '19:00:00', 'nyitva'),
(35, 5, 'Vasárnap',  '08:00:00', '19:00:00', 'nyitva');

-- ---------------------------------------------------------------------
--  FELHASZNALO-FUGGO TABLAK – szandekosan URESEK
--  felhasznalo, beosztas, csoport, csoport_tagok, rendeles,
--  rendeles_teruletei, berlet, fizetes, szamla, felhasznalo_berlet,
--  beolvasas_naplozas
-- ---------------------------------------------------------------------

INSERT INTO `felhasznalo`
    (`felhasznalo_id`, `szerepkor_id`, `vezeteknev`, `keresztnev`, `email`, `jelszo_hash`,
     `foto_url`, `regisztracio_ideje`, `preferalt_kedvezmeny`, `lakcim`)
VALUES
(1,3, 'Teszt',  'Elek',   'Teszt@turistago.hu', '$2b$10$ko3q5Y6hdxB0xKoQd1.g4e6jW96wZ1U2aTO21LxMi.eWOKKX21NR.', 'alap_profilkep.svg',        '2026-03-10 13:00:00', null,  '4931 Tarpa, Teszt utca 9.');
 
 -- A jelszava : 123