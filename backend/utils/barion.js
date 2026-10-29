// =====================================================================
//  utils/barion.js – kapcsolat a Barion fizetési rendszerrel
//
//  Csak a HTTP hívásokat végzi, az adatbázishoz nem nyúl.
//    fizetesInditas(adat)        → Payment/Start (v2)        { PaymentId, GatewayUrl, Status, ... }
//    fizetesAllapot(paymentId)   → GetPaymentState (v4)      { PaymentId, Status, Total, Currency, ... }
//    gatewayUrl(paymentId)       → a fizetőoldal címe (folytatáshoz)
//
//  Beállítások a .env-ben:
//    BARION_KORNYEZET = test | eles     (test = sandbox, alapértelmezett)
//    BARION_POS_KEY   = a Barion bolt titkos kulcsa (POSKey)
//    BARION_PAYEE     = a Barion fiók e-mail címe, ahová a pénz érkezik
//
//  A Node 18+ beépített fetch()-ét használja, nem kell hozzá új csomag.
// =====================================================================

const KORNYEZETEK = {
  test: { api: "https://api.test.barion.com", secure: "https://secure.test.barion.com" },
  eles: { api: "https://api.barion.com", secure: "https://secure.barion.com" },
};

function kornyezet() {
  return KORNYEZETEK[process.env.BARION_KORNYEZET] || KORNYEZETEK.test;
}

// A Barion a hibákat az "Errors" tömbben adja vissza (néha 200-as státusszal is)
async function barionHivas(url, beallitas) {
  const valasz = await fetch(url, {
    ...beallitas,
    headers: {
      "Content-Type": "application/json",
      "x-pos-key": process.env.BARION_POS_KEY,
      ...(beallitas.headers || {}),
    },
  });

  let adat;
  try {
    adat = await valasz.json();
  } catch {
    adat = {};
  }

  if (!valasz.ok || (Array.isArray(adat.Errors) && adat.Errors.length)) {
    const uzenet = (adat.Errors || []).map((e) => `${e.ErrorCode}: ${e.Description}`).join("; ");
    const hiba = new Error(`Barion hiba (${valasz.status}) ${uzenet}`);
    hiba.code = "BARION_HIBA";
    hiba.barion = adat.Errors;
    throw hiba;
  }
  return adat;
}

// ---------------------------------------------------------------------
//  Fizetés indítása
//  adat: { paymentRequestId, osszeg, penznem, payerEmail, megnevezes, leiras,
//          redirectUrl, callbackUrl }
// ---------------------------------------------------------------------
async function fizetesInditas(adat) {
  return barionHivas(`${kornyezet().api}/v2/Payment/Start`, {
    method: "POST",
    body: JSON.stringify({
      POSKey: process.env.BARION_POS_KEY,
      PaymentType: "Immediate",
      GuestCheckOut: true,
      FundingSources: ["All"],
      PaymentRequestId: adat.paymentRequestId,
      PayerHint: adat.payerEmail,
      PaymentWindow: "00:30:00",
      Locale: "hu-HU",
      Currency: adat.penznem,
      RedirectUrl: adat.redirectUrl,
      CallbackUrl: adat.callbackUrl,
      Transactions: [
        {
          POSTransactionId: `${adat.paymentRequestId}-1`,
          Payee: process.env.BARION_PAYEE,
          Total: adat.osszeg,
          Items: [
            {
              Name: adat.megnevezes,
              Description: adat.leiras,
              Quantity: 1,
              Unit: "db",
              UnitPrice: adat.osszeg,
              ItemTotal: adat.osszeg,
            },
          ],
        },
      ],
    }),
  });
}

// ---------------------------------------------------------------------
//  Fizetés állapotának lekérdezése (a callbacknek sosem hiszünk vakon,
//  mindig innen kérdezzük le a valódi állapotot)
// ---------------------------------------------------------------------
async function fizetesAllapot(paymentId) {
  return barionHivas(`${kornyezet().api}/v4/payment/${encodeURIComponent(paymentId)}/paymentstate`, {
    method: "GET",
  });
}

function gatewayUrl(paymentId) {
  return `${kornyezet().secure}/Pay?Id=${encodeURIComponent(paymentId)}&lang=hu_HU`;
}

module.exports = { fizetesInditas, fizetesAllapot, gatewayUrl };
