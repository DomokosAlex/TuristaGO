// =====================================================================
//  middleware/authorize.js – "SZABAD NEKED?"  (RBAC = szerepkör alapú jog)
//
//  Az auth UTÁN kell használni, mert az tölti ki a req.user-t.
//  Felsorolod, melyik szerepkörök mehetnek tovább, mindenki más 403-at kap.
//
//  Példák:
//    router.delete("/:id", auth, authorize("fo_admin"), ...)
//    router.put("/:id",    auth, authorize("fo_admin", "latvanyossag_admin"), ...)
//
//  401 = nem tudjuk, ki vagy (auth.js)
//  403 = tudjuk, ki vagy, de nincs jogod (authorize.js)
//
//  Szerepkörök: turista, dolgozo, fo_admin, latvanyossag_admin
// =====================================================================

function authorize(...szerepkorok) {
  return (req, res, next) => {
    if (!szerepkorok.includes(req.user.szerepkor)) {
      return res.status(403).json({ error: "Nincs jogosultságod" });
    }
    next();
  };
}

module.exports = authorize;
