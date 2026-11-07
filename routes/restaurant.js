var express = require('express');
var db = require('../bd');
var selectOptions = require('../config/constants');
var forbidden = require('../middleware/auth').forbidden;
var router = express.Router();

// Permisos: admin puede todo; user solo ve todo y crea/edita tickets (sin borrar).
function entityOfPath(path) {
  var parts = path.split('/').filter(Boolean);
  return parts[0] === 'api' ? parts[1] : parts[0];
}

function isDeleteRequest(req) {
  return req.method === 'DELETE' || /\/delete(\/|$)/.test(req.path);
}

function canWrite(user, entityName) {
  return user.role === 'admin' || entityName === 'tickets';
}

router.use(function(req, res, next) {
  if (req.method === 'GET') return next();
  if (req.user.role === 'admin') return next();
  var isTicketItem = /\/items(\/|$)/.test(req.path);
  var isTicketDelete = isDeleteRequest(req) && !isTicketItem;
  if (canWrite(req.user, entityOfPath(req.path)) && !isTicketDelete) return next();
  forbidden(req, res);
});

var entities = {
  clientes: {
    title: 'Clientes',
    table: 'clientes',
    fields: ['nombre', 'telefono', 'dni']
  },
  mozos: {
    title: 'Mozos',
    table: 'mozos',
    fields: ['nombre', 'telefono', 'turno', 'estado'],
    selects: { turno: selectOptions.turnos, estado: selectOptions.estadosPersonal }
  },
  cocineros: {
    title: 'Cocineros',
    table: 'cocineros',
    fields: ['nombre', 'telefono', 'especialidad', 'estado'],
    selects: { estado: selectOptions.estadosPersonal }
  },
  productos: {
    title: 'Productos',
    table: 'productos',
    fields: ['nombre', 'categoria', 'precio', 'tiempo_preparacion_min', 'disponible'],
    selects: { categoria: selectOptions.categoriasProducto, disponible: selectOptions.disponibilidad }
  },
  tickets: {
    title: 'Tickets',
    table: 'tickets',
    fields: ['numero_mesa', 'estado', 'cliente_id', 'mozo_id', 'cocinero_id'],
    listFields: ['numero_mesa', 'estado', 'total', 'fecha_hora', 'cliente_id', 'mozo_id', 'cocinero_id'],
    selects: { estado: selectOptions.estadosTicket },
    createDefaults: { estado: 'pendiente' }
  }
};

var optionalFields = ['cliente_id', 'cocinero_id'];

function isApi(req) {
  return req.path.indexOf('/api/') === 0;
}

// Responde un error {status, message} como JSON (API) o texto (HTML).
function respondError(req, res, error) {
  var status = error.status || 400;
  if (isApi(req)) return res.status(status).json({ error: error.message });
  res.status(status).send(error.message);
}

function friendlyDbError(error) {
  if (/UNIQUE/.test(error.message)) return { status: 400, message: 'Ya existe un registro con ese valor' };
  if (/FOREIGN KEY/.test(error.message)) return { status: 400, message: 'Referencia inválida o registro en uso' };
  if (/CHECK/.test(error.message)) return { status: 400, message: 'Valor fuera de rango' };
  console.error(error);
  return { status: 400, message: error.message };
}

function getEntity(req, res) {
  var entity = entities[req.params.entity];
  if (!entity) {
    respondError(req, res, { status: 404, message: 'Entidad no encontrada' });
    return null;
  }
  return entity;
}

function normalizeValue(field, value) {
  if (value === undefined || value === null) return null;
  if (optionalFields.indexOf(field) !== -1 && value === '') return null;
  if (field === 'disponible') return Number(value);
  return value;
}

// Valida el cuerpo y devuelve { values } o { error }.
function validateBody(entity, body) {
  var values = [];
  for (var i = 0; i < entity.fields.length; i++) {
    var field = entity.fields[i];
    var value = normalizeValue(field, body[field]);

    if (value === null && optionalFields.indexOf(field) !== -1) {
      values.push(null);
      continue;
    }
    if (value === null || value === '' || (typeof value === 'string' && !value.trim())) {
      return { error: 'Todos los campos son obligatorios (' + field + ')' };
    }
    if (typeof value === 'string') value = value.trim();

    if (field === 'precio' || field === 'tiempo_preparacion_min' || field === 'numero_mesa') {
      value = Number(value);
      if (!isFinite(value) || value < 0) return { error: 'Valor inválido en ' + field };
      if (field !== 'precio' && !Number.isInteger(value)) return { error: field + ' debe ser un entero' };
    }
    if (field === 'disponible' && value !== 0 && value !== 1) {
      return { error: 'Valor inválido en disponible' };
    }
    if (entity.selects && entity.selects[field] && field !== 'disponible') {
      var allowed = entity.selects[field].some(function(option) { return option.value === value; });
      if (!allowed) return { error: 'Valor inválido en ' + field };
    }
    values.push(value);
  }
  return { values: values };
}

function formFields(entity, editRow) {
  return entity.fields.filter(function(field) {
    return field !== 'estado' || entity !== entities.tickets || Boolean(editRow);
  });
}

function queryRows(entity, callback) {
  db.all('SELECT * FROM ' + entity.table + ' ORDER BY id DESC', callback);
}

// ---- Operaciones compartidas (HTML y API) ----
function createRecord(entity, body, callback) {
  var data = Object.assign({}, body, entity.createDefaults || {});
  var result = validateBody(entity, data);
  if (result.error) return callback({ status: 400, message: result.error });
  db.run(
    'INSERT INTO ' + entity.table + ' (' + entity.fields.join(', ') + ') VALUES (' +
      entity.fields.map(function() { return '?'; }).join(', ') + ')',
    result.values,
    function(error) {
      if (error) return callback(friendlyDbError(error));
      callback(null, this.lastID);
    }
  );
}

function updateRecord(entity, id, body, callback) {
  var result = validateBody(entity, body);
  if (result.error) return callback({ status: 400, message: result.error });
  db.run(
    'UPDATE ' + entity.table + ' SET ' + entity.fields.map(function(field) {
      return field + ' = ?';
    }).join(', ') + ' WHERE id = ?',
    result.values.concat(id),
    function(error) {
      if (error) return callback(friendlyDbError(error));
      if (this.changes === 0) return callback({ status: 404, message: 'Registro no encontrado' });
      callback(null);
    }
  );
}

var relationFields = {
  clientes: 'cliente_id',
  mozos: 'mozo_id',
  cocineros: 'cocinero_id'
};

function deleteRecord(entityName, entity, id, callback) {
  function deleteRow() {
    db.run('DELETE FROM ' + entity.table + ' WHERE id = ?', [id], function(error) {
      if (error) return callback(friendlyDbError(error));
      if (this.changes === 0) return callback({ status: 404, message: 'Registro no encontrado' });
      callback(null);
    });
  }

  var relationField = relationFields[entityName];
  if (relationField) {
    // Los tickets conservan su historial: se desasigna la persona antes de borrarla.
    return db.run(
      'UPDATE tickets SET ' + relationField + ' = NULL WHERE ' + relationField + ' = ?',
      [id],
      function(error) {
        if (error) return callback(friendlyDbError(error));
        deleteRow();
      }
    );
  }

  if (entityName === 'productos') {
    return db.get('SELECT COUNT(*) AS total FROM ticket_items WHERE producto_id = ?', [id], function(error, row) {
      if (error) return callback(friendlyDbError(error));
      if (row.total > 0) {
        return callback({ status: 409, message: 'No se puede eliminar: el producto está en tickets. Márcalo como no disponible.' });
      }
      deleteRow();
    });
  }

  // tickets: sus ítems se eliminan por ON DELETE CASCADE
  deleteRow();
}

// ---- Ítems de ticket ----
function recalcTotal(ticketId, callback) {
  db.run(
    'UPDATE tickets SET total = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM ticket_items WHERE ticket_id = ?), 0) WHERE id = ?',
    [ticketId, ticketId],
    callback
  );
}

function addItem(ticketId, productoId, cantidad, callback) {
  cantidad = Number(cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return callback({ status: 400, message: 'La cantidad debe ser un entero mayor a 0' });
  }
  db.get('SELECT id FROM tickets WHERE id = ?', [ticketId], function(ticketError, ticket) {
    if (ticketError) return callback(friendlyDbError(ticketError));
    if (!ticket) return callback({ status: 404, message: 'Ticket no encontrado' });
    db.get('SELECT id, precio, disponible FROM productos WHERE id = ?', [productoId], function(prodError, producto) {
      if (prodError) return callback(friendlyDbError(prodError));
      if (!producto) return callback({ status: 404, message: 'Producto no encontrado' });
      if (producto.disponible !== 1) return callback({ status: 400, message: 'Producto no disponible' });
      db.run(
        'INSERT INTO ticket_items (ticket_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        [ticketId, producto.id, cantidad, producto.precio],
        function(error) {
          if (error) return callback(friendlyDbError(error));
          var itemId = this.lastID;
          recalcTotal(ticketId, function(totalError) {
            if (totalError) return callback(friendlyDbError(totalError));
            callback(null, itemId);
          });
        }
      );
    });
  });
}

function removeItem(ticketId, itemId, callback) {
  db.run('DELETE FROM ticket_items WHERE id = ? AND ticket_id = ?', [itemId, ticketId], function(error) {
    if (error) return callback(friendlyDbError(error));
    if (this.changes === 0) return callback({ status: 404, message: 'Ítem no encontrado' });
    recalcTotal(ticketId, function(totalError) {
      if (totalError) return callback(friendlyDbError(totalError));
      callback(null);
    });
  });
}

function renderEntity(req, res, entityName, entity, editRow) {
  db.all('SELECT id, nombre FROM clientes ORDER BY nombre', function(clientError, clientes) {
    if (clientError) return respondError(req, res, friendlyDbError(clientError));
    db.all('SELECT id, nombre, estado FROM mozos ORDER BY nombre', function(mozoError, allMozos) {
      if (mozoError) return respondError(req, res, friendlyDbError(mozoError));
      db.all('SELECT id, nombre, estado FROM cocineros ORDER BY nombre', function(cocineroError, allCocineros) {
        // Formulario: solo activos (más el actual al editar). Lista: todos, para mostrar nombres.
        var mozos = allMozos.filter(function(m) { return m.estado === 'activo' || (editRow && m.id === editRow.mozo_id); });
        var cocineros = allCocineros.filter(function(c) { return c.estado === 'activo' || (editRow && c.id === editRow.cocinero_id); });
        if (cocineroError) return respondError(req, res, friendlyDbError(cocineroError));
        queryRows(entity, function(rowsError, rows) {
          if (rowsError) return respondError(req, res, friendlyDbError(rowsError));
          res.render('entity', {
            title: entity.title,
            entityName: entityName,
            fields: entity.listFields || entity.fields,
            formFields: formFields(entity, editRow),
            selects: entity.selects || {},
            rows: rows,
            editRow: editRow,
            canWrite: canWrite(req.user, entityName),
            canDelete: req.user.role === 'admin',
            relationOptions: { cliente_id: clientes, mozo_id: mozos, cocinero_id: cocineros },
            relationNames: { cliente_id: clientes, mozo_id: allMozos, cocinero_id: allCocineros }
          });
        });
      });
    });
  });
}

// ---- Rutas HTML ----
router.get('/tickets/:id', function(req, res) {
  db.get(
    'SELECT t.*, c.nombre AS cliente, m.nombre AS mozo, k.nombre AS cocinero FROM tickets t ' +
    'LEFT JOIN clientes c ON c.id = t.cliente_id LEFT JOIN mozos m ON m.id = t.mozo_id ' +
    'LEFT JOIN cocineros k ON k.id = t.cocinero_id WHERE t.id = ?',
    [req.params.id],
    function(error, ticket) {
      if (error) return respondError(req, res, friendlyDbError(error));
      if (!ticket) return res.status(404).send('Ticket no encontrado');
      db.all(
        'SELECT i.*, p.nombre AS producto FROM ticket_items i JOIN productos p ON p.id = i.producto_id WHERE i.ticket_id = ? ORDER BY i.id',
        [ticket.id],
        function(itemsError, items) {
          if (itemsError) return respondError(req, res, friendlyDbError(itemsError));
          db.all('SELECT id, nombre, precio FROM productos WHERE disponible = 1 ORDER BY nombre', function(prodError, productos) {
            if (prodError) return respondError(req, res, friendlyDbError(prodError));
            res.render('ticket', {
              title: 'Ticket #' + ticket.id,
              ticket: ticket,
              items: items,
              productos: productos,
              error: req.query.error || null
            });
          });
        }
      );
    }
  );
});

router.post('/tickets/:id/items', function(req, res) {
  addItem(req.params.id, req.body.producto_id, req.body.cantidad, function(error) {
    var back = '/restaurant/tickets/' + req.params.id;
    if (error) return res.redirect(back + '?error=' + encodeURIComponent(error.message));
    res.redirect(back);
  });
});

router.post('/tickets/:id/items/:itemId/delete', function(req, res) {
  removeItem(req.params.id, req.params.itemId, function(error) {
    var back = '/restaurant/tickets/' + req.params.id;
    if (error) return res.redirect(back + '?error=' + encodeURIComponent(error.message));
    res.redirect(back);
  });
});

// Vista HTML: /restaurant/clientes, /restaurant/mozos, etc.
router.get('/:entity', function(req, res, next) {
  if (req.params.entity === 'api') return next();
  var entity = getEntity(req, res);
  if (!entity) return;
  renderEntity(req, res, req.params.entity, entity, null);
});

router.get('/:entity/edit/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  db.get('SELECT * FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error, editRow) {
    if (error) return respondError(req, res, friendlyDbError(error));
    if (!editRow) return res.status(404).send('Registro no encontrado');
    renderEntity(req, res, req.params.entity, entity, editRow);
  });
});

router.post('/:entity', function(req, res, next) {
  if (req.params.entity === 'api') return next();
  var entity = getEntity(req, res);
  if (!entity) return;
  createRecord(entity, req.body, function(error) {
    if (error) return respondError(req, res, error);
    res.redirect('/restaurant/' + req.params.entity);
  });
});

router.post('/:entity/edit/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  updateRecord(entity, req.params.id, req.body, function(error) {
    if (error) return respondError(req, res, error);
    res.redirect('/restaurant/' + req.params.entity);
  });
});

router.post('/:entity/delete/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  deleteRecord(req.params.entity, entity, req.params.id, function(error) {
    if (error) return respondError(req, res, error);
    res.redirect('/restaurant/' + req.params.entity);
  });
});

// ---- API JSON ----
router.get('/api/:entity', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  queryRows(entity, function(error, rows) {
    if (error) return respondError(req, res, friendlyDbError(error));
    res.json(rows);
  });
});

router.get('/api/tickets/:id/items', function(req, res) {
  db.all(
    'SELECT i.*, p.nombre AS producto FROM ticket_items i JOIN productos p ON p.id = i.producto_id WHERE i.ticket_id = ? ORDER BY i.id',
    [req.params.id],
    function(error, items) {
      if (error) return respondError(req, res, friendlyDbError(error));
      res.json(items);
    }
  );
});

router.post('/api/tickets/:id/items', function(req, res) {
  addItem(req.params.id, req.body.producto_id, req.body.cantidad, function(error, itemId) {
    if (error) return respondError(req, res, error);
    res.status(201).json({ id: itemId });
  });
});

router.delete('/api/tickets/:id/items/:itemId', function(req, res) {
  removeItem(req.params.id, req.params.itemId, function(error) {
    if (error) return respondError(req, res, error);
    res.status(204).send();
  });
});

router.get('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  db.get('SELECT * FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error, row) {
    if (error) return respondError(req, res, friendlyDbError(error));
    if (!row) return respondError(req, res, { status: 404, message: 'Registro no encontrado' });
    res.json(row);
  });
});

router.post('/api/:entity', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  createRecord(entity, req.body, function(error, id) {
    if (error) return respondError(req, res, error);
    res.status(201).json({ id: id });
  });
});

router.put('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  updateRecord(entity, req.params.id, req.body, function(error) {
    if (error) return respondError(req, res, error);
    res.json({ message: 'Registro actualizado' });
  });
});

router.delete('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req, res);
  if (!entity) return;
  deleteRecord(req.params.entity, entity, req.params.id, function(error) {
    if (error) return respondError(req, res, error);
    res.status(204).send();
  });
});

module.exports = router;
