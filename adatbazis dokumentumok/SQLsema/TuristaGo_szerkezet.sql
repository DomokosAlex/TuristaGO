-- =====================================================================
--  TuristaGo  –  adatbázis szerkezet (V2)
--  Forrás: TuristaGo_V2er.svg (ER) + TuristaGo_V2uml.svg (UML)
--  Cél: MySQL 8.0+ / MariaDB 10.4+  (InnoDB, utf8mb4, magyar rendezés)
--  Csak szerkezet – adatot nem tartalmaz.
-- =====================================================================

-- A kapcsolat is UTF-8 (utf8mb4) legyen, hogy az ékezetes alapértelmezett
-- értékek (pl. "Május 14. tér 16.") hibátlanul kerüljenek be.
SET NAMES utf8mb4 COLLATE utf8mb4_hungarian_ci;

CREATE DATABASE IF NOT EXISTS `turistago`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_hungarian_ci;

USE `turistago`;

-- =====================================================================
--  1. SZINT – önálló táblák (más táblára nem hivatkoznak)
-- =====================================================================

-- ---------------------------------------------------------------------
--  SZEREPKOR
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `szerepkor` (
    `szerepkor_id`  INT          NOT NULL AUTO_INCREMENT,
    `megnevezes`    VARCHAR(20)  NOT NULL,
    PRIMARY KEY (`szerepkor_id`),
    UNIQUE KEY `uq_szerepkor_megnevezes` (`megnevezes`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  LATVANYOSSAG
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `latvanyossag` (
    `latvanyossag_id`    INT           NOT NULL AUTO_INCREMENT,
    `megnevezes`         VARCHAR(150)  NOT NULL,
    `tartozkodasi_cim`   VARCHAR(255)  NOT NULL,
    `leiras`             TEXT          NOT NULL,
    PRIMARY KEY (`latvanyossag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- =====================================================================
--  2. SZINT – FELHASZNALO és a LATVANYOSSAG-hoz tartozó táblák
-- =====================================================================

-- ---------------------------------------------------------------------
--  FELHASZNALO   (SZEREPKOR 1 —rendelkezik— N FELHASZNALO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `felhasznalo` (
    `felhasznalo_id`        INT           NOT NULL AUTO_INCREMENT,
    `szerepkor_id`          INT           NOT NULL,
    `vezeteknev`            VARCHAR(50)   NOT NULL,
    `keresztnev`            VARCHAR(50)   NOT NULL,
    `email`                 VARCHAR(100)  NOT NULL,
    `jelszo_hash`           VARCHAR(255)  NOT NULL,
    `foto_url`              VARCHAR(255)  NOT NULL DEFAULT 'alap_profilkep.svg',
    `regisztracio_ideje`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `preferalt_kedvezmeny`  ENUM('Felnőtt','Diák','Szociális') NULL,
    `lakcim`                VARCHAR(255)  NOT NULL,
    PRIMARY KEY (`felhasznalo_id`),
    UNIQUE KEY `uq_felhasznalo_email` (`email`),
    KEY `idx_felhasznalo_szerepkor` (`szerepkor_id`),
    CONSTRAINT `fk_felhasznalo_szerepkor`
        FOREIGN KEY (`szerepkor_id`) REFERENCES `szerepkor` (`szerepkor_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  KEDVEZMENYTIPUS   (LATVANYOSSAG 1 —meghatároz— N KEDVEZMENYTIPUS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `kedvezmenytipus` (
    `kedvezmeny_id`       INT            NOT NULL AUTO_INCREMENT,
    `latvanyossag_id`     INT            NOT NULL,
    `kedvezmeny_nev`      ENUM('Felnőtt','Diák','Szociális') NOT NULL,
    `kedvezmeny_merteke`  DECIMAL(10,2)  NOT NULL,
    PRIMARY KEY (`kedvezmeny_id`),
    -- kiegészítés: egy látványossághoz egy kedvezménytípus csak egyszer szerepelhet
    UNIQUE KEY `uq_kedvezmeny_latvanyossag_nev` (`latvanyossag_id`, `kedvezmeny_nev`),
    CONSTRAINT `fk_kedvezmeny_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `chk_kedvezmeny_merteke` CHECK (`kedvezmeny_merteke` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  LATVANYOSSAG_TERULET   (LATVANYOSSAG 1 —meghatároz— N LATVANYOSSAG_TERULET)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `latvanyossag_terulet` (
    `terulet_id`           INT            NOT NULL AUTO_INCREMENT,
    `latvanyossag_id`      INT            NOT NULL,
    `terulet_megnevezes`   VARCHAR(100)   NOT NULL,
    `terulet_leiras`       TEXT           NOT NULL,
    `terulet_ar`           DECIMAL(10,2)  NOT NULL,
    PRIMARY KEY (`terulet_id`),
    KEY `idx_terulet_latvanyossag` (`latvanyossag_id`),
    CONSTRAINT `fk_terulet_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `chk_terulet_ar` CHECK (`terulet_ar` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  LATVANYOSSAG_KEP   (a "kepek" többértékű tulajdonság – LATVANYOSSAG 1 —kepei— N)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `latvanyossag_kep` (
    `kep_id`           INT           NOT NULL AUTO_INCREMENT,
    `latvanyossag_id`  INT           NOT NULL,
    `kep_url`          VARCHAR(255)  NOT NULL,
    PRIMARY KEY (`kep_id`),
    KEY `idx_kep_latvanyossag` (`latvanyossag_id`),
    CONSTRAINT `fk_kep_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  ZARVA_TARTAS   (LATVANYOSSAG 1 —érinti— N ZARVA_TARTAS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `zarva_tartas` (
    `zarvatartas_id`   INT           NOT NULL AUTO_INCREMENT,
    `latvanyossag_id`  INT           NOT NULL,
    `kezdo_datum`      DATETIME      NOT NULL,
    `vege_datum`       DATETIME      NOT NULL,
    `indok`            VARCHAR(255)  NULL,
    PRIMARY KEY (`zarvatartas_id`),
    -- a látványosság szerinti és időszak szerinti szűrést is gyorsítja
    KEY `idx_zarva_latvanyossag_idoszak` (`latvanyossag_id`, `kezdo_datum`, `vege_datum`),
    CONSTRAINT `fk_zarva_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `chk_zarva_idoszak` CHECK (`vege_datum` >= `kezdo_datum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  NYITVATARTAS   (LATVANYOSSAG 1 —meghatároz— N NYITVATARTAS)
--  Látványosságonként naponta legfeljebb egy sor.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `nyitvatartas` (
    `nyitvatartas_id`  INT  NOT NULL AUTO_INCREMENT,
    `latvanyossag_id`  INT  NOT NULL,
    `nap_neve`         ENUM('Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat','Vasárnap') NOT NULL,
    `kezdet_ora`       TIME NULL,
    `vege_ora`         TIME NULL,
    `allapot`          ENUM('nyitva','zárva') NOT NULL,
    PRIMARY KEY (`nyitvatartas_id`),
    UNIQUE KEY `uq_nyitvatartas_latvanyossag_nap` (`latvanyossag_id`, `nap_neve`),
    CONSTRAINT `fk_nyitvatartas_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  BEOSZTAS   (FELHASZNALO M —beosztás— N LATVANYOSSAG; dolgozói beosztás)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `beosztas` (
    `beosztas_id`        INT       NOT NULL AUTO_INCREMENT,
    `felhasznalo_id`     INT       NOT NULL,
    `latvanyossag_id`    INT       NOT NULL,
    `csatlakozas_datum`  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `kilepett_datum`     DATETIME  NULL,
    PRIMARY KEY (`beosztas_id`),
    KEY `idx_beosztas_felhasznalo` (`felhasznalo_id`),
    KEY `idx_beosztas_latvanyossag` (`latvanyossag_id`),
    CONSTRAINT `fk_beosztas_felhasznalo`
        FOREIGN KEY (`felhasznalo_id`) REFERENCES `felhasznalo` (`felhasznalo_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_beosztas_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- =====================================================================
--  3. SZINT – csoportok, rendelések
-- =====================================================================

-- ---------------------------------------------------------------------
--  CSOPORT   (FELHASZNALO 1 —kezel— N CSOPORT)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `csoport` (
    `csoport_id`             INT           NOT NULL AUTO_INCREMENT,
    `vezeto_felhasznalo_id`  INT           NOT NULL,
    `csoport_nev`            VARCHAR(100)  NOT NULL,
    `csoport_kategoria`      ENUM('egyeni','csoportos') NOT NULL DEFAULT 'egyeni',
    `letrehozva_datum`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `allapot`                ENUM('aktiv','archivalt','torolt') NOT NULL DEFAULT 'aktiv',
    PRIMARY KEY (`csoport_id`),
    KEY `idx_csoport_vezeto` (`vezeto_felhasznalo_id`),
    CONSTRAINT `fk_csoport_vezeto`
        FOREIGN KEY (`vezeto_felhasznalo_id`) REFERENCES `felhasznalo` (`felhasznalo_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  CSOPORT_TAGOK   (CSOPORT M —csoport_tagok— N FELHASZNALO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `csoport_tagok` (
    `csoport_tagok_id`  INT       NOT NULL AUTO_INCREMENT,
    `csoport_id`        INT       NOT NULL,
    `felhasznalo_id`    INT       NOT NULL,
    `csatlakozasi_ido`  DATETIME  NULL,
    `tag_allapot`       ENUM('aktiv','fuggoben','kilepett','elutasitott') NOT NULL DEFAULT 'fuggoben',
    PRIMARY KEY (`csoport_tagok_id`),
    UNIQUE KEY `uq_csoport_tagok_csoport_felhasznalo` (`csoport_id`, `felhasznalo_id`),
    KEY `idx_csoport_tagok_felhasznalo` (`felhasznalo_id`),
    CONSTRAINT `fk_csoport_tagok_csoport`
        FOREIGN KEY (`csoport_id`) REFERENCES `csoport` (`csoport_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_csoport_tagok_felhasznalo`
        FOREIGN KEY (`felhasznalo_id`) REFERENCES `felhasznalo` (`felhasznalo_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  RENDELES   (CSOPORT 1 —tartozik— N RENDELES)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rendeles` (
    `rendeles_id`  INT            NOT NULL AUTO_INCREMENT,
    `csoport_id`   INT            NOT NULL,
    `allapot`      ENUM('folyamatban','kifizetve','torolt') NOT NULL DEFAULT 'folyamatban',
    `osszeg`       DECIMAL(10,2)  NOT NULL,
    PRIMARY KEY (`rendeles_id`),
    KEY `idx_rendeles_csoport` (`csoport_id`),
    KEY `idx_rendeles_allapot` (`allapot`),
    CONSTRAINT `fk_rendeles_csoport`
        FOREIGN KEY (`csoport_id`) REFERENCES `csoport` (`csoport_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `chk_rendeles_osszeg` CHECK (`osszeg` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- =====================================================================
--  4. SZINT – rendeléshez kapcsolódó táblák
-- =====================================================================

-- ---------------------------------------------------------------------
--  RENDELES_TERULETEI   (RENDELES 1 —tartalmaz— N ; LATVANYOSSAG_TERULET 1 —kiválaszt— M)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rendeles_teruletei` (
    `rendeles_terulet_id`  INT  NOT NULL AUTO_INCREMENT,
    `rendeles_id`          INT  NOT NULL,
    `terulet_id`           INT  NOT NULL,
    PRIMARY KEY (`rendeles_terulet_id`),
    UNIQUE KEY `uq_rendeles_terulet` (`rendeles_id`, `terulet_id`),
    KEY `idx_rendeles_teruletei_terulet` (`terulet_id`),
    CONSTRAINT `fk_rendeles_teruletei_rendeles`
        FOREIGN KEY (`rendeles_id`) REFERENCES `rendeles` (`rendeles_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_rendeles_teruletei_terulet`
        FOREIGN KEY (`terulet_id`) REFERENCES `latvanyossag_terulet` (`terulet_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  BERLET   (RENDELES 1 —létrehoz— 1 BERLET)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `berlet` (
    `berlet_id`        INT       NOT NULL AUTO_INCREMENT,
    `rendeles_id`      INT       NOT NULL,
    `vasarlas_datum`   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `ervenyes_kezdet`  DATETIME  NOT NULL,
    `ervenyes_vege`    DATETIME  NOT NULL,
    `allapot`          ENUM('inaktiv','aktiv','lejart') NOT NULL DEFAULT 'inaktiv',
    PRIMARY KEY (`berlet_id`),
    UNIQUE KEY `uq_berlet_rendeles` (`rendeles_id`),
    KEY `idx_berlet_allapot_vege` (`allapot`, `ervenyes_vege`),
    CONSTRAINT `fk_berlet_rendeles`
        FOREIGN KEY (`rendeles_id`) REFERENCES `rendeles` (`rendeles_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `chk_berlet_ervenyesseg` CHECK (`ervenyes_vege` >= `ervenyes_kezdet`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  FIZETES   (RENDELES 1 —fizet— N FIZETES)  – Barion fizetési kísérletek
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fizetes` (
    `fizetes_id`          INT            NOT NULL AUTO_INCREMENT,
    `rendeles_id`         INT            NOT NULL,
    `payment_request_id`  VARCHAR(100)   NOT NULL,
    `barion_payment_id`   VARCHAR(100)   NULL,
    `vegosszeg`           DECIMAL(10,2)  NOT NULL,
    `penznem`             VARCHAR(3)     NOT NULL,
    `statusz`             ENUM('Prepared','Succeeded','Canceled','Expired','Started','InProgress',
                               'Waiting','Reserved','Authorized','Failed','PartiallySucceeded')
                          NOT NULL DEFAULT 'Prepared',
    `utolso_frissites`    DATETIME       NULL,
    `kiserlet_idopontja`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`fizetes_id`),
    UNIQUE KEY `uq_fizetes_payment_request` (`payment_request_id`),
    UNIQUE KEY `uq_fizetes_barion_payment` (`barion_payment_id`),
    KEY `idx_fizetes_rendeles` (`rendeles_id`),
    KEY `idx_fizetes_statusz` (`statusz`),
    CONSTRAINT `fk_fizetes_rendeles`
        FOREIGN KEY (`rendeles_id`) REFERENCES `rendeles` (`rendeles_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `chk_fizetes_vegosszeg` CHECK (`vegosszeg` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  SZAMLA   (FIZETES 1 —generál— 1 SZAMLA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `szamla` (
    `szamla_id`         INT            NOT NULL AUTO_INCREMENT,
    `fizetes_id`        INT            NOT NULL,
    `szamlaszam`        VARCHAR(50)    NOT NULL,
    `netto_osszeg`      DECIMAL(10,2)  NOT NULL,
    `afa_kulcs`         DECIMAL(10,2)  NOT NULL,
    `brutto_osszeg`     DECIMAL(10,2)  NOT NULL,
    `penznem`           VARCHAR(3)     NOT NULL,
    `vevo_nev`          VARCHAR(110)   NOT NULL,
    `elado_nev`         VARCHAR(100)   NOT NULL DEFAULT 'TuristaGo Kft.',
    `elado_adoszam`     VARCHAR(13)    NOT NULL DEFAULT '12345678-1-15',
    `elado_lakcim`      VARCHAR(255)   NOT NULL DEFAULT '4900 Fehérgyarmat, Május 14. tér 16.',
    `vevo_lakcim`       VARCHAR(255)   NOT NULL,
    `kiallitas_datuma`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`szamla_id`),
    UNIQUE KEY `uq_szamla_fizetes` (`fizetes_id`),
    UNIQUE KEY `uq_szamla_szamlaszam` (`szamlaszam`),
    CONSTRAINT `fk_szamla_fizetes`
        FOREIGN KEY (`fizetes_id`) REFERENCES `fizetes` (`fizetes_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `chk_szamla_osszegek` CHECK (`netto_osszeg` >= 0 AND `brutto_osszeg` >= 0 AND `afa_kulcs` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- ---------------------------------------------------------------------
--  FELHASZNALO_BERLET   (FELHASZNALO N —birtokol— M BERLET; QR token)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `felhasznalo_berlet` (
    `felhasznalo_berlet_id`  INT           NOT NULL AUTO_INCREMENT,
    `felhasznalo_id`         INT           NOT NULL,
    `berlet_id`              INT           NOT NULL,
    `qr_token`               VARCHAR(255)  NOT NULL,
    PRIMARY KEY (`felhasznalo_berlet_id`),
    UNIQUE KEY `uq_felhasznalo_berlet` (`felhasznalo_id`, `berlet_id`),
    UNIQUE KEY `uq_felhasznalo_berlet_qr` (`qr_token`),
    KEY `idx_felhasznalo_berlet_berlet` (`berlet_id`),
    CONSTRAINT `fk_fb_felhasznalo`
        FOREIGN KEY (`felhasznalo_id`) REFERENCES `felhasznalo` (`felhasznalo_id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_fb_berlet`
        FOREIGN KEY (`berlet_id`) REFERENCES `berlet` (`berlet_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- =====================================================================
--  5. SZINT – QR beolvasás naplózása
-- =====================================================================

-- ---------------------------------------------------------------------
--  BEOLVASAS_NAPLOZAS
--  FELHASZNALO_BERLET 1 —beolvas— N ; LATVANYOSSAG 1 —olvas— N ;
--  BEOSZTAS 1 —ellenőriz— N
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `beolvasas_naplozas` (
    `naplo_id`                INT       NOT NULL AUTO_INCREMENT,
    `felhasznalo_berlet_id`   INT       NOT NULL,
    `latvanyossag_id`         INT       NOT NULL,
    `belepes_ideje`           DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `kilepes_ideje`           DATETIME  NULL,
    `validalas_eredmeny_QR`   ENUM('elfogadva','elutasitva') NOT NULL,
    `beosztas_id`             INT       NOT NULL,
    `elutasitas_oka`          TEXT      NULL,
    PRIMARY KEY (`naplo_id`),
    KEY `idx_naplo_felhasznalo_berlet` (`felhasznalo_berlet_id`),
    KEY `idx_naplo_latvanyossag_belepes` (`latvanyossag_id`, `belepes_ideje`),
    KEY `idx_naplo_beosztas` (`beosztas_id`),
    CONSTRAINT `fk_naplo_felhasznalo_berlet`
        FOREIGN KEY (`felhasznalo_berlet_id`) REFERENCES `felhasznalo_berlet` (`felhasznalo_berlet_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_naplo_latvanyossag`
        FOREIGN KEY (`latvanyossag_id`) REFERENCES `latvanyossag` (`latvanyossag_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_naplo_beosztas`
        FOREIGN KEY (`beosztas_id`) REFERENCES `beosztas` (`beosztas_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `chk_naplo_kilepes` CHECK (`kilepes_ideje` IS NULL OR `kilepes_ideje` >= `belepes_ideje`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

CREATE TABLE IF NOT EXISTS `refresh_token` (
    `refresh_token_id`  INT          NOT NULL AUTO_INCREMENT,
    `felhasznalo_id`    INT          NOT NULL,
    `token_hash`        CHAR(64)     NOT NULL,
    `kliens_tipus`      ENUM('web','mobil') NOT NULL DEFAULT 'web',
    `lejarat`           DATETIME     NOT NULL,
    `visszavonva`       TINYINT(1)   NOT NULL DEFAULT 0,
    `letrehozva`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`refresh_token_id`),
    UNIQUE KEY `uq_refresh_token_hash` (`token_hash`),
    KEY `idx_refresh_felhasznalo` (`felhasznalo_id`),
    CONSTRAINT `fk_refresh_felhasznalo`
        FOREIGN KEY (`felhasznalo_id`) REFERENCES `felhasznalo` (`felhasznalo_id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;
