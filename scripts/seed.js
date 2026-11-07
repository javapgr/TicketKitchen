// Carga datos de ejemplo. Solo corre si no hay productos (no duplica ni pisa datos).
var db = require('../bd');

function run(sql, params) {
  return new Promise(function(resolve, reject) {
    db.run(sql, params || [], function(error) {
      if (error) return reject(error);
      resolve(this.lastID);
    });
  });
}

function get(sql, params) {
  return new Promise(function(resolve, reject) {
    db.get(sql, params || [], function(error, row) {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

async function seed() {
  var existing = await get('SELECT COUNT(*) AS total FROM productos');
  if (existing.total > 0) {
    console.log('Ya hay productos; no se cargan datos de ejemplo.');
    return;
  }

  var clientes = [
    ['Ana Torres', '999111222', '45678901'],
    ['Luis Ramos', '999333444', '41234567']
  ];
  for (var c of clientes) {
    await run('INSERT INTO clientes (nombre, telefono, dni) VALUES (?, ?, ?)', c);
  }

  var mozos = [
    ['Carlos Pérez', '988111222', 'mañana', 'activo'],
    ['María López', '988333444', 'tarde', 'activo']
  ];
  for (var m of mozos) {
    await run('INSERT INTO mozos (nombre, telefono, turno, estado) VALUES (?, ?, ?, ?)', m);
  }

  var cocineros = [
    ['Jorge Salas', '977111222', 'parrillero', 'activo'],
    ['Rosa Díaz', '977333444', 'guarniciones', 'activo']
  ];
  for (var k of cocineros) {
    await run('INSERT INTO cocineros (nombre, telefono, especialidad, estado) VALUES (?, ?, ?, ?)', k);
  }

  var productos = [
    ['Asado de tira', 'parrillas', 45.0, 25, 1],
    ['Parrilla mixta', 'parrillas', 70.0, 35, 1],
    ['Gaseosa 500ml', 'bebidas', 6.0, 2, 1],
    ['Chicha morada', 'bebidas', 8.0, 3, 1],
    ['Papas fritas', 'guarniciones', 12.0, 10, 1],
    ['Ensalada mixta', 'guarniciones', 10.0, 5, 1],
    ['Flan', 'postres', 9.0, 3, 1]
  ];
  for (var p of productos) {
    await run(
      'INSERT INTO productos (nombre, categoria, precio, tiempo_preparacion_min, disponible) VALUES (?, ?, ?, ?, ?)',
      p
    );
  }

  // [mesa, estado, cliente, mozo, cocinero, [[producto_id, cantidad], ...]]
  var tickets = [
    [1, 'pendiente', 1, 1, 1, [[1, 2], [3, 2], [5, 1]]],
    [2, 'en_parrilla', 2, 2, 1, [[2, 1], [4, 2]]],
    [3, 'entregado', null, 1, 2, [[6, 1], [7, 2]]]
  ];
  for (var t of tickets) {
    var ticketId = await run(
      'INSERT INTO tickets (numero_mesa, estado, cliente_id, mozo_id, cocinero_id) VALUES (?, ?, ?, ?, ?)',
      t.slice(0, 5)
    );
    for (var item of t[5]) {
      var producto = await get('SELECT precio FROM productos WHERE id = ?', [item[0]]);
      await run(
        'INSERT INTO ticket_items (ticket_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        [ticketId, item[0], item[1], producto.precio]
      );
    }
    await run(
      'UPDATE tickets SET total = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM ticket_items WHERE ticket_id = ?), 0) WHERE id = ?',
      [ticketId, ticketId]
    );
  }

  console.log('Datos de ejemplo cargados: 2 clientes, 2 mozos, 2 cocineros, 7 productos, 3 tickets.');
}

seed()
  .catch(function(error) {
    console.error('Error al cargar datos:', error.message);
    process.exitCode = 1;
  })
  .then(function() {
    db.close();
  });
