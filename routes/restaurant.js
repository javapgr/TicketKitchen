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
  return req.method === 'DELETE' || /\/delete\//.test(req.path) || /\/items\/\d+\/delete/.test(req.path);
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

function getEntity(name, res) {
  var entity = entities[name];
  if (!entity) {
    res.status(404).json({ error: 'Entidad no encontrada' });
    return null;
  }
  return entity;
}

function valuesFromBody(entity, body) {
  return entity.fields.map(function(field) {
    var value = body[field];
    if (field === 'disponible') {
      return Number(value);
    }
    if (['cliente_id', 'cocinero_id'].includes(field) && value === '') {
      return null;
    }
    return value === undefined ? null : value;
  });
}

function formFields(entity, editRow) {
  return entity.fields.filter(function(field) {
    return field !== 'estado' || entity !== entities.tickets || Boolean(editRow);
  });
}

function queryRows(entity, callback) {
  db.all('SELECT * FROM ' + entity.table + ' ORDER BY id DESC', callback);
}

function sendError(res, error) {
  console.error(error);
  res.status(400).json({ error: error.message });
}

function renderEntity(req, res, entityName, entity, editRow) {
  db.all('SELECT id, nombre FROM clientes ORDER BY nombre', function(clientError, clientes) {
    if (clientError) return sendError(res, clientError);
    db.all("SELECT id, nombre FROM mozos WHERE estado IN ('activo', 'operativo') ORDER BY nombre", function(mozoError, mozos) {
      if (mozoError) return sendError(res, mozoError);
      db.all("SELECT id, nombre FROM cocineros WHERE estado IN ('activo', 'operativo') ORDER BY nombre", function(cocineroError, cocineros) {
        if (cocineroError) return sendError(res, cocineroError);
        queryRows(entity, function(rowsError, rows) {
          if (rowsError) return sendError(res, rowsError);
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
            relationOptions: { cliente_id: clientes, mozo_id: mozos, cocinero_id: cocineros }
          });
        });
      });
    });
  });
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
    if (ticketError) return callback({ status: 400, message: ticketError.message });
    if (!ticket) return callback({ status: 404, message: 'Ticket no encontrado' });
    db.get('SELECT id, precio, disponible FROM productos WHERE id = ?', [productoId], function(prodError, producto) {
      if (prodError) return callback({ status: 400, message: prodError.message });
      if (!producto) return callback({ status: 404, message: 'Producto no encontrado' });
      if (producto.disponible !== 1) return callback({ status: 400, message: 'Producto no disponible' });
      db.run(
        'INSERT INTO ticket_items (ticket_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        [ticketId, producto.id, cantidad, producto.precio],
        function(error) {
          if (error) return callback({ status: 400, message: error.message });
          var itemId = this.lastID;
          recalcTotal(ticketId, function(totalError) {
            if (totalError) return callback({ status: 400, message: totalError.message });
            callback(null, itemId);
          });
        }
      );
    });
  });
}

function removeItem(ticketId, itemId, callback) {
  db.run('DELETE FROM ticket_items WHERE id = ? AND ticket_id = ?', [itemId, ticketId], function(error) {
    if (error) return callback({ status: 400, message: error.message });
    if (this.changes === 0) return callback({ status: 404, message: 'Ítem no encontrado' });
    recalcTotal(ticketId, function(totalError) {
      if (totalError) return callback({ status: 400, message: totalError.message });
      callback(null);
    });
  });
}

router.get('/tickets/:id', function(req, res) {
  db.get(
    'SELECT t.*, c.nombre AS cliente, m.nombre AS mozo, k.nombre AS cocinero FROM tickets t ' +
    'LEFT JOIN clientes c ON c.id = t.cliente_id LEFT JOIN mozos m ON m.id = t.mozo_id ' +
    'LEFT JOIN cocineros k ON k.id = t.cocinero_id WHERE t.id = ?',
    [req.params.id],
    function(error, ticket) {
      if (error) return sendError(res, error);
      if (!ticket) return res.status(404).send('Ticket no encontrado');
      db.all(
        'SELECT i.*, p.nombre AS producto FROM ticket_items i JOIN productos p ON p.id = i.producto_id WHERE i.ticket_id = ? ORDER BY i.id',
        [ticket.id],
        function(itemsError, items) {
          if (itemsError) return sendError(res, itemsError);
          db.all('SELECT id, nombre, precio FROM productos WHERE disponible = 1 ORDER BY nombre', function(prodError, productos) {
            if (prodError) return sendError(res, prodError);
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
    if (error) return res.redirect('/restaurant/tickets/' + req.params.id + '?error=' + encodeURIComponent(error.message));
    res.redirect('/restaurant/tickets/' + req.params.id);
  });
});

router.post('/tickets/:id/items/:itemId/delete', function(req, res) {
  removeItem(req.params.id, req.params.itemId, function(error) {
    if (error) return res.redirect('/restaurant/tickets/' + req.params.id + '?error=' + encodeURIComponent(error.message));
    res.redirect('/restaurant/tickets/' + req.params.id);
  });
});

// Vista HTML: /restaurant/clientes, /restaurant/mozos, etc.
router.get('/:entity', function(req, res, next) {
  if (req.params.entity === 'api') return next();
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  renderEntity(req, res, req.params.entity, entity, null);
});

// API: listar
router.get('/api/:entity', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  queryRows(entity, function(error, rows) {
    if (error) return sendError(res, error);
    res.json(rows);
  });
});

// API: obtener uno
router.get('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  db.get('SELECT * FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error, row) {
    if (error) return sendError(res, error);
    if (!row) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(row);
  });
});

// HTML: formulario de edición
router.get('/:entity/edit/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  db.get('SELECT * FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error, editRow) {
    if (error) return sendError(res, error);
    if (!editRow) return res.status(404).send('Registro no encontrado');
    renderEntity(req, res, req.params.entity, entity, editRow);
  });
});

function saveEntity(req, res, entity, id) {
  if (!id && entity.createDefaults) {
    Object.keys(entity.createDefaults).forEach(function(field) {
      req.body[field] = entity.createDefaults[field];
    });
  }

  var values = valuesFromBody(entity, req.body);
  if (values.some(function(value, index) {
    var field = entity.fields[index];
    return value === '' || (value === null && field !== 'cliente_id' && field !== 'cocinero_id');
  })) {
    return res.status(400).send('Todos los campos son obligatorios');
  }

  if (id) {
    db.run(
      'UPDATE ' + entity.table + ' SET ' + entity.fields.map(function(field) {
        return field + ' = ?';
      }).join(', ') + ' WHERE id = ?',
      values.concat(id),
      function(error) {
        if (error) return sendError(res, error);
        if (this.changes === 0) return res.status(404).send('Registro no encontrado');
        res.redirect('/restaurant/' + req.params.entity);
      }
    );
  } else {
    db.run(
      'INSERT INTO ' + entity.table + ' (' + entity.fields.join(', ') + ') VALUES (' +
        entity.fields.map(function() { return '?'; }).join(', ') + ')',
      values,
      function(error) {
        if (error) return sendError(res, error);
        res.redirect('/restaurant/' + req.params.entity);
      }
    );
  }
}

// HTML: crear y editar
router.post('/:entity', function(req, res, next) {
  if (req.params.entity === 'api') return next();
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  saveEntity(req, res, entity);
});

router.post('/:entity/edit/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  saveEntity(req, res, entity, req.params.id);
});

// HTML: eliminar
router.post('/:entity/delete/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;

  var relationFields = {
    clientes: 'cliente_id',
    mozos: 'mozo_id',
    cocineros: 'cocinero_id'
  };
  var relationField = relationFields[req.params.entity];

  function deleteRow() {
    db.run('DELETE FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error) {
      if (error) return sendError(res, error);
      res.redirect('/restaurant/' + req.params.entity);
    });
  }

  if (!relationField) return deleteRow();

  db.run(
    'UPDATE tickets SET ' + relationField + ' = NULL WHERE ' + relationField + ' = ?',
    [req.params.id],
    function(error) {
      if (error) return sendError(res, error);
      deleteRow();
    }
  );
});

// API: crear
router.post('/api/:entity', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  var values = valuesFromBody(entity, req.body);
  db.run(
    'INSERT INTO ' + entity.table + ' (' + entity.fields.join(', ') + ') VALUES (' +
      entity.fields.map(function() { return '?'; }).join(', ') + ')',
    values,
    function(error) {
      if (error) return sendError(res, error);
      res.status(201).json({ id: this.lastID });
    }
  );
});

// API: actualizar
router.put('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  db.run(
    'UPDATE ' + entity.table + ' SET ' + entity.fields.map(function(field) {
      return field + ' = ?';
    }).join(', ') + ' WHERE id = ?',
    valuesFromBody(entity, req.body).concat(req.params.id),
    function(error) {
      if (error) return sendError(res, error);
      if (this.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
      res.json({ message: 'Registro actualizado' });
    }
  );
});

// API: eliminar
router.delete('/api/:entity/:id', function(req, res) {
  var entity = getEntity(req.params.entity, res);
  if (!entity) return;
  db.run('DELETE FROM ' + entity.table + ' WHERE id = ?', [req.params.id], function(error) {
    if (error) return sendError(res, error);
    if (this.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.status(204).send();
  });
});

module.exports = router;
