var express = require('express');
var db = require('../bd');
var router = express.Router();

function sendDatabaseError(res, error) {
  console.error(error);
  res.status(500).json({ error: 'Error de base de datos' });
}

// GET /users/view - interfaz HTML
router.get('/view', function(req, res) {
  db.all('SELECT id, name, email FROM users ORDER BY id', function(error, users) {
    if (error) {
      return sendDatabaseError(res, error);
    }

    res.render('users', { title: 'Usuarios', users: users, editUser: null });
  });
});

// POST /users/view - crear desde el formulario
router.post('/view', function(req, res) {
  if (!req.body || typeof req.body.name !== 'string' || req.body.name.trim() === '') {
    return res.status(400).send('El campo name es obligatorio');
  }

  db.run(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    [req.body.name.trim(), typeof req.body.email === 'string' ? req.body.email.trim() : ''],
    function(error) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      res.redirect('/users/view');
    }
  );
});

// POST /users/view/delete/:id - eliminar desde la interfaz
router.post('/view/delete/:id', function(req, res) {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(error) {
    if (error) {
      return sendDatabaseError(res, error);
    }

    res.redirect('/users/view');
  });
});

// GET /users/view/edit/:id - mostrar formulario de edición
router.get('/view/edit/:id', function(req, res) {
  db.get('SELECT id, name, email FROM users WHERE id = ?', [req.params.id], function(error, editUser) {
    if (error) {
      return sendDatabaseError(res, error);
    }

    if (!editUser) {
      return res.status(404).send('Usuario no encontrado');
    }

    db.all('SELECT id, name, email FROM users ORDER BY id', function(listError, users) {
      if (listError) {
        return sendDatabaseError(res, listError);
      }

      res.render('users', { title: 'Usuarios', users: users, editUser: editUser });
    });
  });
});

// POST /users/view/edit/:id - actualizar desde la interfaz
router.post('/view/edit/:id', function(req, res) {
  if (!req.body || typeof req.body.name !== 'string' || req.body.name.trim() === '') {
    return res.status(400).send('El campo name es obligatorio');
  }

  db.run(
    'UPDATE users SET name = ?, email = ? WHERE id = ?',
    [
      req.body.name.trim(),
      typeof req.body.email === 'string' ? req.body.email.trim() : '',
      req.params.id
    ],
    function(error) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      res.redirect('/users/view');
    }
  );
});

// GET /users - listar usuarios
router.get('/', function(req, res) {
  db.all('SELECT id, name, email FROM users ORDER BY id', function(error, users) {
    if (error) {
      return sendDatabaseError(res, error);
    }

    res.json(users);
  });
});

// GET /users/:id - obtener un usuario
router.get('/:id', function(req, res) {
  db.get(
    'SELECT id, name, email FROM users WHERE id = ?',
    [req.params.id],
    function(error, user) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json(user);
    }
  );
});

// POST /users - crear un usuario
router.post('/', function(req, res) {
  if (!req.body || typeof req.body.name !== 'string' || req.body.name.trim() === '') {
    return res.status(400).json({ error: 'El campo name es obligatorio' });
  }

  var name = req.body.name.trim();
  var email = typeof req.body.email === 'string' ? req.body.email.trim() : '';

  db.run(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    [name, email],
    function(error) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      res.status(201).json({ id: this.lastID, name: name, email: email });
    }
  );
});

// PUT /users/:id - actualizar un usuario completo
router.put('/:id', function(req, res) {
  if (!req.body || typeof req.body.name !== 'string' || req.body.name.trim() === '') {
    return res.status(400).json({ error: 'El campo name es obligatorio' });
  }

  var name = req.body.name.trim();
  var email = typeof req.body.email === 'string' ? req.body.email.trim() : '';

  db.run(
    'UPDATE users SET name = ?, email = ? WHERE id = ?',
    [name, email, req.params.id],
    function(error) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ id: Number(req.params.id), name: name, email: email });
    }
  );
});

// PATCH /users/:id - actualizar parcialmente un usuario
router.patch('/:id', function(req, res) {
  var fields = [];
  var values = [];

  if (req.body && req.body.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim() === '') {
      return res.status(400).json({ error: 'El campo name no puede estar vacío' });
    }
    fields.push('name = ?');
    values.push(req.body.name.trim());
  }

  if (req.body && req.body.email !== undefined) {
    if (typeof req.body.email !== 'string') {
      return res.status(400).json({ error: 'El campo email debe ser texto' });
    }
    fields.push('email = ?');
    values.push(req.body.email.trim());
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Debes enviar name o email' });
  }

  values.push(req.params.id);
  db.run(
    'UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?',
    values,
    function(error) {
      if (error) {
        return sendDatabaseError(res, error);
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      db.get(
        'SELECT id, name, email FROM users WHERE id = ?',
        [req.params.id],
        function(selectError, user) {
          if (selectError) {
            return sendDatabaseError(res, selectError);
          }
          res.json(user);
        }
      );
    }
  );
});

// DELETE /users/:id - eliminar un usuario
router.delete('/:id', function(req, res) {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(error) {
    if (error) {
      return sendDatabaseError(res, error);
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(204).send();
  });
});

module.exports = router;
