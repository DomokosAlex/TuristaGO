require("dotenv").config({ quiet: true });
const express = require("express");

const authRoutes = require("./routes/auth");
const latvanyossagRoutes = require("./routes/latvanyossag");
const felhasznalo = require("./routes/felhasznalo");
const beosztasRoutes = require("./routes/beosztas");
const csoportRoutes = require("./routes/csoport");
const berletRoutes = require("./routes/berlet");
const rendelesRoutes = require("./routes/rendeles");
const fizetesRoutes = require("./routes/rendeles_fizetes");

const beolvasasRoutes = require("./routes/beolvasas");

const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/latvanyossag", latvanyossagRoutes);
app.use("/api/felhasznalo", felhasznalo);
app.use("/api/beosztas", beosztasRoutes);
app.use("/api/csoport", csoportRoutes);
app.use("/api/berlet", berletRoutes);
app.use("/api/rendeles", rendelesRoutes);
app.use("/api/fizetes", fizetesRoutes);
app.use("/api/beolvasas", beolvasasRoutes);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`A szerver fut: http://localhost:${PORT}`);
});



/*

express 5	webszerver, útvonalak
mysql2	adatbázis-kapcsolat
jsonwebtoken	access és refresh tokenek
bcryptjs	jelszavak hash-elése
dotenv	a .env beolvasása
nodemon (dev)	automatikus újraindítás fejlesztés közben

*/