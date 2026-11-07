var jwt = require('jsonwebtoken');

var jwtSecret = require('../config/auth').jwtSecret;

function requireAuth(req, res, next) {
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
}

function forbidden(req, res) {
  if (req.originalUrl.indexOf('/api/') !== -1 || req.is('json')) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  res.status(403).send('No tienes permiso para esta acción');
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return forbidden(req, res);
  next();
}

function redirectOrReject(req, res) {
  if (req.originalUrl.indexOf('/restaurant/api/') === 0 || req.is('json')) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }
  res.redirect('/auth/login');
}

module.exports = requireAuth;
module.exports.requireAdmin = requireAdmin;
module.exports.forbidden = forbidden;
