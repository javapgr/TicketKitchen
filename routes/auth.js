var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var db = require('../bd');

var router = express.Router();
var jwtSecret = process.env.JWT_SECRET || 'ticketkitchen-development-secret';
var maxFailedAttempts = 2;
var lockDurationMs = 15 * 60 * 1000;

router.get('/login', function(req, res) {
  res.render('login', { title: 'Iniciar sesión', error: null });
});

router.get('/register', function(req, res) {
  res.render('register', { title: 'Crear usuario', error: null });
});

router.post('/register', function(req, res) {
  var email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  var password = typeof req.body.password === 'string' ? req.body.password : '';
  var passwordConfirmation = typeof req.body.password_confirmation === 'string'
    ? req.body.password_confirmation
    : '';

  if (!email || !password || !passwordConfirmation) {
    return registerError(req, res, 'Correo y contraseñas son obligatorios');
  }
  if (password.length < 8) {
    return registerError(req, res, 'La contraseña debe tener al menos 8 caracteres');
  }
  if (password !== passwordConfirmation) {
    return registerError(req, res, 'Las contraseñas no coinciden');
  }

  var passwordHash = bcrypt.hashSync(password, 12);
  db.run(
    'INSERT INTO auth_users (email, password_hash, role) VALUES (?, ?, ?)',
    [email, passwordHash, 'user'],
    function(error) {
      if (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
          return registerError(req, res, 'Ese correo ya está registrado');
        }
        console.error(error);
        return res.status(500).json({ error: 'Error de base de datos' });
      }

      if (req.is('json')) {
        return res.status(201).json({ message: 'Usuario creado correctamente', id: this.lastID });
      }
      res.redirect('/auth/login');
    }
  );
});

router.post('/login', function(req, res) {
  var email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  var password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return loginError(req, res, 'Correo y contraseña son obligatorios');
  }

  db.get('SELECT id, email, password_hash, role, failed_attempts, locked_until FROM auth_users WHERE email = ?', [email], function(error, user) {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Error de base de datos' });
    }

    if (!user) {
      return loginError(req, res, 'Credenciales inválidas');
    }

    var now = Date.now();
    if (user.locked_until && user.locked_until > now) {
      return loginError(req, res, 'Cuenta bloqueada. Intenta de nuevo en ' + remainingMinutes(user.locked_until, now) + ' minutos', 429);
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      var failedAttempts = user.failed_attempts + 1;
      var lockedUntil = failedAttempts >= maxFailedAttempts ? now + lockDurationMs : null;
      db.run(
        'UPDATE auth_users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
        [lockedAttempts(failedAttempts), lockedUntil, user.id],
        function(updateError) {
          if (updateError) {
            console.error(updateError);
            return res.status(500).json({ error: 'Error de base de datos' });
          }
          var message = lockedUntil
            ? 'Cuenta bloqueada durante 15 minutos por demasiados intentos'
            : 'Credenciales inválidas. Te queda 1 intento';
          loginError(req, res, message);
        }
      );
      return;
    }

    db.run('UPDATE auth_users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id], function(resetError) {
      if (resetError) {
        console.error(resetError);
        return res.status(500).json({ error: 'Error de base de datos' });
      }

    var token = jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
    res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });

    if (req.is('json')) {
      return res.json({ message: 'Inicio de sesión correcto', user: { id: user.id, email: user.email, role: user.role } });
    }
    res.redirect('/');
    });
  });
});

router.post('/logout', function(req, res) {
  res.clearCookie('auth_token');
  res.redirect('/auth/login');
});

function loginError(req, res, message, statusCode) {
  if (req.is('json')) {
    return res.status(statusCode || 401).json({ error: message });
  }
  res.status(statusCode || 401).render('login', { title: 'Iniciar sesión', error: message });
}

function registerError(req, res, message) {
  if (req.is('json')) {
    return res.status(400).json({ error: message });
  }
  res.status(400).render('register', { title: 'Crear usuario', error: message });
}

function remainingMinutes(lockedUntil, now) {
  return Math.ceil((lockedUntil - now) / 60000);
}

function lockedAttempts(attempts) {
  return Math.min(attempts, maxFailedAttempts);
}

module.exports = router;
