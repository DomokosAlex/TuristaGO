// =====================================================================
//  middleware/auth.js – "KI VAGY?"
//
//  A route ELŐTT fut le. Megnézi az Authorization fejlécet:
//      Authorization: Bearer <accessToken>
//  - ha a token jó   → req.user = { id, szerepkor }  és next() (mehet tovább)
//  - ha nincs / rossz / lejárt → 401
//
//  Példa:  router.get("/me", auth, (req, res) => res.json(req.user));
// =====================================================================
const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Hiányzó token" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, szerepkor, iat, exp }
    next();
  } catch {
    res.status(401).json({ error: "Érvénytelen vagy lejárt token" });
  }
}

module.exports = auth;
