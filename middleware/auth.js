var jwt = require('jsonwebtoken');

var jwtSecret = require('../config/auth').jwtSecret;

module.exports = function requireAuth(req, res, next) {
  var token = req.cookies && req.cookies.auth_token;
  if (!token) {
    return redirectOrReject(req, res);
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    res.locals.user = req.user;
    next();
  } catch (error) {
    res.clearCookie('auth_token');
    redirectOrReject(req, res);
  }
};

function redirectOrReject(req, res) {
  if (req.path.indexOf('/api/') === 0 || req.is('json')) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }
  res.redirect('/auth/login');
}
