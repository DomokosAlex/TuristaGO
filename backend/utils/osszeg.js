// =====================================================================
//  utils/osszeg.js – a rendelés összegének kiszámítása
//
//  Összeg = minden résztvevőre (vezető + aktív tagok) a rendelés területeinek
//  ára, az adott látványosság kedvezményével csökkentve. A kedvezményt a
//  résztvevő felhasznalo.preferalt_kedvezmeny mezője adja (üres = Felnőtt).
//
//  Példa (mintaadat, 4. rendelés): 2 felnőtt × 2800 + 1 szociális (30%) × 2800
//                                  = 2800 + 2800 + 1960 = 7560 Ft
//
//  Az összeget mindig a szerver számolja, a kliens nem küldheti be.
//  A db lehet a pool vagy egy tranzakció kapcsolata is.
// =====================================================================

async function osszegFrissites(db, rendelesId) {
  const [sorok] = await db.query(
    `SELECT COALESCE(ROUND(SUM(t.terulet_ar * (1 - COALESCE(k.kedvezmeny_merteke, 0) / 100)), 2), 0) AS osszeg
       FROM rendeles_teruletei rt
       JOIN latvanyossag_terulet t ON t.terulet_id  = rt.terulet_id
       JOIN rendeles r             ON r.rendeles_id = rt.rendeles_id
       JOIN csoport  c             ON c.csoport_id  = r.csoport_id
       JOIN felhasznalo f
         ON f.felhasznalo_id = c.vezeto_felhasznalo_id
         OR f.felhasznalo_id IN (SELECT ct.felhasznalo_id FROM csoport_tagok ct
                                  WHERE ct.csoport_id = c.csoport_id AND ct.tag_allapot = 'aktiv')
       LEFT JOIN kedvezmenytipus k
         ON k.latvanyossag_id = t.latvanyossag_id
        AND k.kedvezmeny_nev  = COALESCE(f.preferalt_kedvezmeny, 'Felnőtt')
      WHERE rt.rendeles_id = ?`,
    [rendelesId]
  );
  const osszeg = Number(sorok[0].osszeg);

  await db.query("UPDATE rendeles SET osszeg = ? WHERE rendeles_id = ?", [osszeg, rendelesId]);
  return osszeg;
}

module.exports = { osszegFrissites };
