DROP DATABASE IF EXISTS turistago;
CREATE DATABASE turistago
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_hungarian_ci;
USE turistago;

CREATE TABLE FELHASZNALO (
  felhasznalo_id  INT AUTO_INCREMENT PRIMARY KEY,
  vezeteknev      VARCHAR(50)  NOT NULL,
  keresztnev      VARCHAR(50)  NOT NULL,
  email           VARCHAR(100) NOT NULL,
  jelszo          VARCHAR(255) NOT NULL,          
  szelfi_foto     MEDIUMBLOB   NULL,
  CONSTRAINT uk_felhasznalo_email UNIQUE (email)
) ENGINE=InnoDB;


CREATE TABLE SZEREPKOR (
  szerepkor_id    INT AUTO_INCREMENT PRIMARY KEY,
  felhasznalo_id  INT NOT NULL,
  megnevezes      VARCHAR(50) NOT NULL,
  CONSTRAINT fk_szerepkor_felhasznalo FOREIGN KEY (felhasznalo_id)
    REFERENCES FELHASZNALO (felhasznalo_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE TURISTA_CSOPORT (
  csoport_id        INT AUTO_INCREMENT PRIMARY KEY,
  csoport_nev       VARCHAR(100) NOT NULL,
  statusz           VARCHAR(20)  NOT NULL DEFAULT 'AKTIV',
  letrehozas_ideje  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archivalas_ideje  DATETIME     NULL
) ENGINE=InnoDB;


CREATE TABLE TAGSAG (
  tagsag_id           INT AUTO_INCREMENT PRIMARY KEY,
  felhasznalo_id      INT NOT NULL,
  csoport_id          INT NOT NULL,
  csoport_szerepkor   VARCHAR(30) NOT NULL DEFAULT 'TAG',
  kedvezmeny_allitas  VARCHAR(50) NULL,
  tag_statusz         VARCHAR(20) NOT NULL DEFAULT 'FUGGO',
  csatlakozas_ideje   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tagsag_felhasznalo FOREIGN KEY (felhasznalo_id)
    REFERENCES FELHASZNALO (felhasznalo_id),
  CONSTRAINT fk_tagsag_csoport FOREIGN KEY (csoport_id)
    REFERENCES TURISTA_CSOPORT (csoport_id),
  CONSTRAINT uk_tagsag_felh_csop UNIQUE (felhasznalo_id, csoport_id)
) ENGINE=InnoDB;

CREATE TABLE BERLETKATEGORIA (
  berlet_kat_id         INT AUTO_INCREMENT PRIMARY KEY,
  kategoria_megnevezes  VARCHAR(50)  NOT NULL,
  kategoria_kedvezmeny  DECIMAL(5,2) NOT NULL DEFAULT 0   
) ENGINE=InnoDB;

CREATE TABLE LATVANYOSSAG (
  latvanyossag_id        INT AUTO_INCREMENT PRIMARY KEY,
  megnevezes             VARCHAR(100) NOT NULL,
  tartozkodasi_cim       VARCHAR(255) NOT NULL,
  nyitvatartas           VARCHAR(255) NULL,
  leiras                 TEXT         NULL,
  kep                    MEDIUMBLOB   NULL,
  validalas_elerhetoseg  VARCHAR(255) NULL          
) ENGINE=InnoDB;


CREATE TABLE JEGYTIPUS (
  jegytipus_id     INT AUTO_INCREMENT PRIMARY KEY,
  jegy_nev         VARCHAR(100)  NOT NULL,
  alap_ar          DECIMAL(10,2) NOT NULL,
  latvanyossag_id  INT           NULL,
  jegy_leiras      VARCHAR(255)  NULL,
  penznem          CHAR(3)       NOT NULL DEFAULT 'HUF',
  CONSTRAINT fk_jegytipus_latvanyossag FOREIGN KEY (latvanyossag_id)
    REFERENCES LATVANYOSSAG (latvanyossag_id)
) ENGINE=InnoDB;


CREATE TABLE BERLET (
  berlet_id            INT AUTO_INCREMENT PRIMARY KEY,
  tagsag_id            INT NOT NULL,
  berlettipus_id       INT NOT NULL,          
  berlet_kategoria_id  INT NOT NULL,          
  vasarlas_datuma      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ervenyes_tol         DATE        NOT NULL,
  ervenyes_ig          DATE        NOT NULL,
  statusz              VARCHAR(20) NOT NULL DEFAULT 'FUGGO',
  qr_kod               VARCHAR(255) NOT NULL,
  CONSTRAINT uk_berlet_qr UNIQUE (qr_kod),
  CONSTRAINT fk_berlet_tagsag FOREIGN KEY (tagsag_id)
    REFERENCES TAGSAG (tagsag_id),
  CONSTRAINT fk_berlet_jegytipus FOREIGN KEY (berlettipus_id)
    REFERENCES JEGYTIPUS (jegytipus_id),
  CONSTRAINT fk_berlet_kategoria FOREIGN KEY (berlet_kategoria_id)
    REFERENCES BERLETKATEGORIA (berlet_kat_id),
  CONSTRAINT chk_berlet_ervenyesseg CHECK (ervenyes_ig >= ervenyes_tol)
) ENGINE=InnoDB;


CREATE TABLE TARTALMAZ (
  kapcsolat_id     INT AUTO_INCREMENT PRIMARY KEY,
  latvanyossag_id  INT NOT NULL,
  berlet_id        INT NOT NULL,
  CONSTRAINT fk_tartalmaz_latvanyossag FOREIGN KEY (latvanyossag_id)
    REFERENCES LATVANYOSSAG (latvanyossag_id),
  CONSTRAINT fk_tartalmaz_berlet FOREIGN KEY (berlet_id)
    REFERENCES BERLET (berlet_id) ON DELETE CASCADE,
  CONSTRAINT uk_tartalmaz UNIQUE (berlet_id, latvanyossag_id)
) ENGINE=InnoDB;

CREATE TABLE LATOGATAS (
  latogatas_id           INT AUTO_INCREMENT PRIMARY KEY,
  berlet_id              INT NOT NULL,
  latvanyossag_id        INT NOT NULL,
  belepes_ideje          DATETIME    NOT NULL,
  kilepes_ideje          DATETIME    NULL,
  validalas_eredmeny_QR  VARCHAR(20) NOT NULL,
  CONSTRAINT fk_latogatas_berlet FOREIGN KEY (berlet_id)
    REFERENCES BERLET (berlet_id),
  CONSTRAINT fk_latogatas_latvanyossag FOREIGN KEY (latvanyossag_id)
    REFERENCES LATVANYOSSAG (latvanyossag_id)
) ENGINE=InnoDB;


CREATE TABLE DIAKELLENORZES (
  ellenorzes_id             INT AUTO_INCREMENT PRIMARY KEY,
  berlet_id                 INT NOT NULL,
  validalas_elerhetoseg_id  INT NOT NULL,   
  idopontja                 DATETIME    NOT NULL,
  eredmeny                  VARCHAR(30) NOT NULL,
  CONSTRAINT fk_diakell_berlet FOREIGN KEY (berlet_id)
    REFERENCES BERLET (berlet_id),
  CONSTRAINT fk_diakell_latvanyossag FOREIGN KEY (validalas_elerhetoseg_id)
    REFERENCES LATVANYOSSAG (latvanyossag_id)
) ENGINE=InnoDB;


CREATE TABLE FIZETES (
  fizetes_id          INT AUTO_INCREMENT PRIMARY KEY,
  berlet_id           INT NOT NULL,
  barion_payment_id   VARCHAR(100) NOT NULL,
  PaymentRequest_id   VARCHAR(255) NOT NULL,  
  vegosszeg           DECIMAL(10,2) NOT NULL,
  statusz             VARCHAR(20)   NOT NULL,
  kiserlet_idopontja  DATETIME      NOT NULL,
  penznem             CHAR(3)       NOT NULL DEFAULT 'HUF',
  CONSTRAINT uk_fizetes_barion UNIQUE (barion_payment_id),
  CONSTRAINT fk_fizetes_berlet FOREIGN KEY (berlet_id)
    REFERENCES BERLET (berlet_id)
) ENGINE=InnoDB;


CREATE TABLE SZAMLA (
  szamla_id         INT AUTO_INCREMENT PRIMARY KEY,
  fizetes_id        INT NOT NULL,
  szamlaszam        VARCHAR(50)  NOT NULL,
  penznem           CHAR(3)      NOT NULL DEFAULT 'HUF',
  vevo_nev          VARCHAR(100) NOT NULL,
  elado_nev         VARCHAR(100) NOT NULL,
  kiallitas_datuma  DATE         NOT NULL,
  netto_osszeg      DECIMAL(10,2) NOT NULL,
  afa_osszeg        DECIMAL(10,2) NOT NULL,
  brutto_osszeg     DECIMAL(10,2) NOT NULL,
  CONSTRAINT uk_szamla_fizetes UNIQUE (fizetes_id),
  CONSTRAINT uk_szamla_szam UNIQUE (szamlaszam),
  CONSTRAINT fk_szamla_fizetes FOREIGN KEY (fizetes_id)
    REFERENCES FIZETES (fizetes_id)
) ENGINE=InnoDB;

INSERT INTO FELHASZNALO (felhasznalo_id, vezeteknev, keresztnev, email, jelszo, szelfi_foto) VALUES
  (1, 'Kovács', 'Anna', 'anna.kovacs@example.hu', '$2y$10$ed20a3f3b8b4c67c848b6f53d9da31270cf3a20998944b2b7e027', NULL),
  (2, 'Nagy', 'Péter', 'peter.nagy@example.hu', '$2y$10$598dbeb7ca96ccc4523ea8c997fc9cbd6be29baf571495ded2788', NULL),
  (3, 'Szabó', 'Eszter', 'eszter.szabo@example.hu', '$2y$10$19f18324dfa42ec28807f6c031c9cb24c3883959e13deaa973b1f', NULL),
  (4, 'Tóth', 'Gábor', 'gabor.toth@example.hu', '$2y$10$f17d669b0bbef5851c64467c1d543071f7b7797904815eab35f4a', NULL),
  (5, 'Horváth', 'Lili', 'lili.horvath@example.hu', '$2y$10$d78ce1d4cf4cee59274e4af744c2d28af2b3ae50ef3a4b6ef7e23', NULL),
  (6, 'Varga', 'Bence', 'bence.varga@example.hu', '$2y$10$21210d5c82c583f57eb2bc41508907904509b9b2827ee030be98c', NULL),
  (7, 'Kiss', 'Dóra', 'dora.kiss@example.hu', '$2y$10$81d89e72b4f2859ba9b8b4dc1b0ca814a657e778c668000c036e3', NULL),
  (8, 'Molnár', 'Zoltán', 'zoltan.molnar@example.hu', '$2y$10$8140c55cc1fe345b851cb9f9bb361c9d79f42a8c13e31e5c4732a', NULL),
  (9, 'Farkas', 'Réka', 'reka.farkas@example.hu', '$2y$10$bfe5f54ad46f9d1ca2d4a5caf2d4493f8835716584ca2529d45c9', NULL),
  (10, 'Balogh', 'Tamás', 'tamas.balogh@example.hu', '$2y$10$1531db76af9ce0e6e9d54799716777e791ff91967bdc796ee52d4', NULL);


INSERT INTO SZEREPKOR (szerepkor_id, felhasznalo_id, megnevezes) VALUES
  (1, 1, 'TURISTA'),
  (2, 2, 'TURISTA'),
  (3, 3, 'TURISTA'),
  (4, 4, 'TURISTA'),
  (5, 5, 'TURISTA'),
  (6, 6, 'TURISTA'),
  (7, 7, 'TURISTA'),
  (8, 8, 'TURISTA'),
  (9, 9, 'ADMIN'),
  (10, 10, 'DOLGOZO'),
  (11, 8, 'DOLGOZO');


INSERT INTO TURISTA_CSOPORT (csoport_id, csoport_nev, statusz, letrehozas_ideje, archivalas_ideje) VALUES
  (1, 'Kovács család', 'AKTIV', '2026-08-01 10:00:00', NULL),
  (2, 'ELTE osztálykirándulás', 'AKTIV', '2026-09-01 14:30:00', NULL),
  (3, 'Debreceni nyugdíjas klub', 'ARCHIVALT', '2026-06-10 09:00:00', '2026-07-15 12:00:00'),
  (4, 'Hétvégi baráti kör', 'AKTIV', '2026-09-15 19:45:00', NULL);


INSERT INTO TAGSAG (tagsag_id, felhasznalo_id, csoport_id, csoport_szerepkor, kedvezmeny_allitas, tag_statusz, csatlakozas_ideje) VALUES
  (1, 1, 1, 'VEZETO', 'NINCS', 'AKTIV', '2026-08-01 10:00:00'),
  (2, 2, 1, 'TAG', 'NINCS', 'AKTIV', '2026-08-01 10:05:00'),
  (3, 3, 2, 'VEZETO', 'DIAK', 'AKTIV', '2026-09-01 14:30:00'),
  (4, 4, 2, 'TAG', 'DIAK', 'AKTIV', '2026-09-02 08:12:00'),
  (5, 5, 2, 'TAG', 'DIAK', 'AKTIV', '2026-09-02 09:40:00'),
  (6, 6, 3, 'VEZETO', 'NYUGDIJAS', 'INAKTIV', '2026-06-10 09:00:00'),
  (7, 7, 3, 'TAG', 'NYUGDIJAS', 'INAKTIV', '2026-06-11 16:20:00'),
  (8, 8, 4, 'VEZETO', 'NINCS', 'AKTIV', '2026-09-15 19:45:00'),
  (9, 1, 4, 'TAG', 'NINCS', 'AKTIV', '2026-09-16 07:30:00'),
  (10, 7, 4, 'TAG', 'NINCS', 'AKTIV', '2026-09-17 11:00:00');


INSERT INTO BERLETKATEGORIA (berlet_kat_id, kategoria_megnevezes, kategoria_kedvezmeny) VALUES
  (1, 'Felnőtt', 0.00),
  (2, 'Diák', 50.00),
  (3, 'Nyugdíjas', 40.00),
  (4, 'Gyermek', 60.00);


INSERT INTO LATVANYOSSAG (latvanyossag_id, megnevezes, tartozkodasi_cim, nyitvatartas, leiras, kep, validalas_elerhetoseg) VALUES
  (1, 'Országház – Látogatóközpont', '1055 Budapest, Kossuth Lajos tér 1–3.', 'H–V 8:00–18:00', 'Vezetett séta a Parlament épületében, a Szent Korona megtekintésével.', NULL, 'https://validacio.turistago.example/lat/1'),
  (2, 'Halászbástya', '1014 Budapest, Szentháromság tér', 'H–V 9:00–19:00 (felső bástya)', 'Neoromán kilátóterasz a Várnegyedben, panorámával a Dunára.', NULL, 'https://validacio.turistago.example/lat/2'),
  (3, 'Mátyás-templom', '1014 Budapest, Szentháromság tér 2.', 'H–Szo 9:00–17:00, V 13:00–17:00', 'A budai Vár gótikus temploma, egyházi gyűjteménnyel.', NULL, 'https://validacio.turistago.example/lat/3'),
  (4, 'Szent István-bazilika', '1051 Budapest, Szent István tér 1.', 'H–V 9:00–19:00', 'Budapest legnagyobb temploma, kupolakilátóval.', NULL, 'https://validacio.turistago.example/lat/4'),
  (5, 'Szépművészeti Múzeum', '1146 Budapest, Dózsa György út 41.', 'K–V 10:00–18:00, H zárva', 'Európai képzőművészeti és ókori gyűjtemények.', NULL, 'https://validacio.turistago.example/lat/5'),
  (6, 'Széchenyi gyógyfürdő', '1146 Budapest, Állatkerti körút 9–11.', 'H–V 7:00–22:00', 'Termálfürdő kültéri és beltéri medencékkel.', NULL, 'https://validacio.turistago.example/lat/6'),
  (7, 'Fővárosi Állat- és Növénykert', '1146 Budapest, Állatkerti körút 6–12.', 'H–V 9:00–18:00', 'Történelmi állatkert a Városligetben.', NULL, 'https://validacio.turistago.example/lat/7'),
  (8, 'Magyar Nemzeti Múzeum', '1088 Budapest, Múzeum körút 14–16.', 'K–V 10:00–18:00, H zárva', 'Magyarország történeti kiállításai.', NULL, 'https://validacio.turistago.example/lat/8');


INSERT INTO JEGYTIPUS (jegytipus_id, jegy_nev, alap_ar, latvanyossag_id, jegy_leiras, penznem) VALUES
  (1, 'Országház – felnőtt belépő', 10000.00, 1, 'Vezetett látogatás, kb. 45 perc', 'HUF'),
  (2, 'Halászbástya – felső bástya', 1500.00, 2, 'Belépés a felső kilátóteraszra', 'HUF'),
  (3, 'Mátyás-templom – belépő', 3500.00, 3, 'Templom és egyházi gyűjtemény', 'HUF'),
  (4, 'Bazilika – kupolakilátó', 2500.00, 4, 'Lift vagy lépcső a kupolához', 'HUF'),
  (5, 'Szépművészeti – állandó kiállítás', 6400.00, 5, 'Állandó kiállítások', 'HUF'),
  (6, 'Széchenyi fürdő – napijegy', 11000.00, 6, 'Egész napos belépő szekrénnyel', 'HUF'),
  (7, 'Állatkert – felnőtt jegy', 5500.00, 7, 'Napijegy', 'HUF'),
  (8, 'Nemzeti Múzeum – belépő', 4000.00, 8, 'Állandó kiállítások', 'HUF'),
  (9, 'TuristaGO 24 órás bérlet', 19900.00, NULL, 'Kombinált bérlet – 1 nap', 'HUF'),
  (10, 'TuristaGO 48 órás bérlet', 29900.00, NULL, 'Kombinált bérlet – 2 nap', 'HUF'),
  (11, 'TuristaGO 72 órás bérlet', 37900.00, NULL, 'Kombinált bérlet – 3 nap', 'HUF');

INSERT INTO BERLET (berlet_id, tagsag_id, berlettipus_id, berlet_kategoria_id, vasarlas_datuma, ervenyes_tol, ervenyes_ig, statusz, qr_kod) VALUES
  (1, 1, 10, 1, '2026-08-02 09:15:00', '2026-08-03', '2026-08-04', 'LEJART', 'TGO-QR-0001-8B87528A'),
  (2, 2, 10, 1, '2026-08-02 09:20:00', '2026-08-03', '2026-08-04', 'LEJART', 'TGO-QR-0002-5669BA32'),
  (3, 3, 11, 2, '2026-09-20 18:00:00', '2026-09-24', '2026-09-26', 'AKTIV', 'TGO-QR-0003-E4FB8E4C'),
  (4, 4, 11, 2, '2026-09-20 18:05:00', '2026-09-24', '2026-09-26', 'AKTIV', 'TGO-QR-0004-0D6319C4'),
  (5, 5, 11, 2, '2026-09-21 08:30:00', '2026-09-24', '2026-09-26', 'FUGGO', 'TGO-QR-0005-33B03448'),
  (6, 6, 9, 3, '2026-06-20 10:00:00', '2026-06-25', '2026-06-25', 'LEJART', 'TGO-QR-0006-0F3B72F9'),
  (7, 7, 9, 3, '2026-06-20 10:02:00', '2026-06-25', '2026-06-25', 'LEJART', 'TGO-QR-0007-441EB0BA'),
  (8, 8, 10, 1, '2026-09-22 20:00:00', '2026-09-26', '2026-09-27', 'AKTIV', 'TGO-QR-0008-CA50B749'),
  (9, 9, 10, 1, '2026-09-22 20:03:00', '2026-09-26', '2026-09-27', 'AKTIV', 'TGO-QR-0009-BF377EF9'),
  (10, 10, 6, 1, '2026-09-23 12:00:00', '2026-09-27', '2026-09-27', 'AKTIV', 'TGO-QR-0010-91ABB653'),
  (11, 1, 5, 1, '2026-08-10 11:00:00', '2026-08-11', '2026-08-11', 'LEJART', 'TGO-QR-0011-EE66F570'),
  (12, 5, 7, 2, '2026-09-23 15:00:00', '2026-09-25', '2026-09-25', 'VISSZAVONT', 'TGO-QR-0012-D8D50407');


INSERT INTO TARTALMAZ (kapcsolat_id, latvanyossag_id, berlet_id) VALUES
  (1, 1, 1),
  (2, 2, 1),
  (3, 3, 1),
  (4, 4, 1),
  (5, 5, 1),
  (6, 1, 2),
  (7, 2, 2),
  (8, 3, 2),
  (9, 4, 2),
  (10, 5, 2),
  (11, 1, 3),
  (12, 2, 3),
  (13, 3, 3),
  (14, 4, 3),
  (15, 5, 3),
  (16, 7, 3),
  (17, 8, 3),
  (18, 1, 4),
  (19, 2, 4),
  (20, 3, 4),
  (21, 4, 4),
  (22, 5, 4),
  (23, 7, 4),
  (24, 8, 4),
  (25, 1, 5),
  (26, 2, 5),
  (27, 3, 5),
  (28, 4, 5),
  (29, 5, 5),
  (30, 7, 5),
  (31, 8, 5),
  (32, 2, 6),
  (33, 3, 6),
  (34, 4, 6),
  (35, 2, 7),
  (36, 3, 7),
  (37, 4, 7),
  (38, 1, 8),
  (39, 2, 8),
  (40, 3, 8),
  (41, 4, 8),
  (42, 5, 8),
  (43, 1, 9),
  (44, 2, 9),
  (45, 3, 9),
  (46, 4, 9),
  (47, 5, 9),
  (48, 6, 10),
  (49, 5, 11),
  (50, 7, 12);

INSERT INTO LATOGATAS (latogatas_id, berlet_id, latvanyossag_id, belepes_ideje, kilepes_ideje, validalas_eredmeny_QR) VALUES
  (1, 1, 1, '2026-08-03 10:00:00', '2026-08-03 11:30:00', 'ELFOGADVA'),
  (2, 1, 2, '2026-08-03 13:00:00', '2026-08-03 13:40:00', 'ELFOGADVA'),
  (3, 1, 3, '2026-08-03 14:00:00', '2026-08-03 15:00:00', 'ELFOGADVA'),
  (4, 1, 5, '2026-08-04 10:00:00', '2026-08-04 12:30:00', 'ELFOGADVA'),
  (5, 1, 6, '2026-08-04 18:00:00', NULL, 'ELUTASITVA'),
  (6, 2, 1, '2026-08-03 10:01:00', '2026-08-03 11:30:00', 'ELFOGADVA'),
  (7, 2, 2, '2026-08-03 13:01:00', '2026-08-03 13:40:00', 'ELFOGADVA'),
  (8, 2, 3, '2026-08-03 14:01:00', '2026-08-03 15:00:00', 'ELFOGADVA'),
  (9, 2, 4, '2026-08-04 16:00:00', '2026-08-04 16:45:00', 'ELFOGADVA'),
  (10, 3, 2, '2026-09-24 10:00:00', '2026-09-24 10:50:00', 'ELFOGADVA'),
  (11, 3, 3, '2026-09-24 11:00:00', '2026-09-24 11:45:00', 'ELFOGADVA'),
  (12, 3, 5, '2026-09-24 14:00:00', '2026-09-24 16:00:00', 'ELFOGADVA'),
  (13, 3, 7, '2026-09-25 09:30:00', NULL, 'ELFOGADVA'),
  (14, 4, 2, '2026-09-24 10:02:00', '2026-09-24 10:50:00', 'ELFOGADVA'),
  (15, 4, 3, '2026-09-24 11:01:00', '2026-09-24 11:45:00', 'ELFOGADVA'),
  (16, 4, 8, '2026-09-25 10:00:00', NULL, 'ELFOGADVA'),
  (17, 5, 2, '2026-09-24 10:03:00', NULL, 'ELUTASITVA'),
  (18, 6, 2, '2026-06-25 10:00:00', '2026-06-25 10:45:00', 'ELFOGADVA'),
  (19, 6, 3, '2026-06-25 11:00:00', '2026-06-25 12:00:00', 'ELFOGADVA'),
  (20, 6, 4, '2026-06-25 14:00:00', '2026-06-25 15:00:00', 'ELFOGADVA'),
  (21, 7, 2, '2026-06-25 10:01:00', '2026-06-25 10:45:00', 'ELFOGADVA'),
  (22, 7, 3, '2026-06-25 11:02:00', '2026-06-25 12:00:00', 'ELFOGADVA'),
  (23, 11, 5, '2026-08-11 10:00:00', '2026-08-11 13:00:00', 'ELFOGADVA'),
  (24, 12, 7, '2026-09-25 09:10:00', NULL, 'ELUTASITVA');


INSERT INTO DIAKELLENORZES (ellenorzes_id, berlet_id, validalas_elerhetoseg_id, idopontja, eredmeny) VALUES
  (1, 3, 2, '2026-09-24 09:59:30', 'ELFOGADVA'),
  (2, 4, 2, '2026-09-24 10:01:30', 'ELFOGADVA'),
  (3, 3, 5, '2026-09-24 13:59:30', 'ELFOGADVA'),
  (4, 4, 8, '2026-09-25 09:59:30', 'ELFOGADVA'),
  (5, 12, 7, '2026-09-25 09:09:30', 'LEJART_IGAZOLVANY'),
  (6, 3, 7, '2026-09-25 09:29:30', 'ELFOGADVA');


INSERT INTO FIZETES (fizetes_id, berlet_id, barion_payment_id, PaymentRequest_id, vegosszeg, statusz, kiserlet_idopontja, penznem) VALUES
  (1, 1, '6f0ccbb06052c7c9c8c34eb7ee589a62', 'TGO-PR-2026-000001', 29900.00, 'SIKERES', '2026-08-02 09:16:10', 'HUF'),
  (2, 2, 'e117ae141a759b4c11c9c0dcc0f879ad', 'TGO-PR-2026-000002', 29900.00, 'SIKERES', '2026-08-02 09:21:05', 'HUF'),
  (3, 3, 'bd0a172502bff326f0044cecf8b92f6c', 'TGO-PR-2026-000003', 18950.00, 'SIKERES', '2026-09-20 18:01:12', 'HUF'),
  (4, 4, 'afa6fc2a25da3c15bdda52b5eb4b1e97', 'TGO-PR-2026-000004', 18950.00, 'SIKERTELEN', '2026-09-20 18:06:40', 'HUF'),
  (5, 4, 'b66c37162e0494c296f84d6afcc6fcfa', 'TGO-PR-2026-000005', 18950.00, 'SIKERES', '2026-09-20 18:09:02', 'HUF'),
  (6, 5, 'f57f831049b120768fe6c28db1dcaf2e', 'TGO-PR-2026-000006', 18950.00, 'SIKERTELEN', '2026-09-21 08:31:15', 'HUF'),
  (7, 5, '4e588a594f4795e028f550fc5399fa7f', 'TGO-PR-2026-000007', 18950.00, 'FUGGO', '2026-09-21 08:40:00', 'HUF'),
  (8, 6, 'a529c0554bf8db10eb3f54a3459ba52e', 'TGO-PR-2026-000008', 11940.00, 'SIKERES', '2026-06-20 10:01:30', 'HUF'),
  (9, 7, '8dceed61bdb83575921d18540c72b4d1', 'TGO-PR-2026-000009', 11940.00, 'SIKERES', '2026-06-20 10:03:10', 'HUF'),
  (10, 8, 'e6a8011eaaa62866e4cf3e0894fab3e4', 'TGO-PR-2026-000010', 29900.00, 'SIKERES', '2026-09-22 20:01:00', 'HUF'),
  (11, 9, '8e8e905aa13c18f00822c517c9aeb4ef', 'TGO-PR-2026-000011', 29900.00, 'SIKERES', '2026-09-22 20:04:20', 'HUF'),
  (12, 10, '3becc21e5dda047a004ca026778605f1', 'TGO-PR-2026-000012', 11000.00, 'SIKERES', '2026-09-23 12:01:45', 'HUF'),
  (13, 11, '31d7145814307beff0b062532782dfa9', 'TGO-PR-2026-000013', 6400.00, 'SIKERES', '2026-08-10 11:01:05', 'HUF'),
  (14, 12, '56ba939e014356eca309f1238d2c6151', 'TGO-PR-2026-000014', 2750.00, 'VISSZATERITVE', '2026-09-23 15:01:20', 'HUF');


INSERT INTO SZAMLA (szamla_id, fizetes_id, szamlaszam, penznem, vevo_nev, elado_nev, kiallitas_datuma, netto_osszeg, afa_osszeg, brutto_osszeg) VALUES
  (1, 8, 'TGO-2026-00001', 'HUF', 'Varga Bence', 'TuristaGO Kft.', '2026-06-20', 9401.57, 2538.43, 11940.00),
  (2, 9, 'TGO-2026-00002', 'HUF', 'Kiss Dóra', 'TuristaGO Kft.', '2026-06-20', 9401.57, 2538.43, 11940.00),
  (3, 1, 'TGO-2026-00003', 'HUF', 'Kovács Anna', 'TuristaGO Kft.', '2026-08-02', 23543.31, 6356.69, 29900.00),
  (4, 2, 'TGO-2026-00004', 'HUF', 'Nagy Péter', 'TuristaGO Kft.', '2026-08-02', 23543.31, 6356.69, 29900.00),
  (5, 13, 'TGO-2026-00005', 'HUF', 'Kovács Anna', 'TuristaGO Kft.', '2026-08-10', 5039.37, 1360.63, 6400.00),
  (6, 3, 'TGO-2026-00006', 'HUF', 'Szabó Eszter', 'TuristaGO Kft.', '2026-09-20', 14921.26, 4028.74, 18950.00),
  (7, 5, 'TGO-2026-00007', 'HUF', 'Tóth Gábor', 'TuristaGO Kft.', '2026-09-20', 14921.26, 4028.74, 18950.00),
  (8, 10, 'TGO-2026-00008', 'HUF', 'Molnár Zoltán', 'TuristaGO Kft.', '2026-09-22', 23543.31, 6356.69, 29900.00),
  (9, 11, 'TGO-2026-00009', 'HUF', 'Kovács Anna', 'TuristaGO Kft.', '2026-09-22', 23543.31, 6356.69, 29900.00),
  (10, 12, 'TGO-2026-00010', 'HUF', 'Kiss Dóra', 'TuristaGO Kft.', '2026-09-23', 8661.42, 2338.58, 11000.00),
  (11, 14, 'TGO-2026-00011', 'HUF', 'Horváth Lili', 'TuristaGO Kft.', '2026-09-23', 2165.35, 584.65, 2750.00);