var sqlite3 = require('sqlite3').verbose();

var db = new sqlite3.Database('./database.sqlite', function(error) {
  if (error) {
    console.error('Error al conectar con SQLite:', error.message);
  }
});

db.serialize(function() {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER
    )
  `);

  db.run('ALTER TABLE auth_users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0', function(error) {
    if (error && !error.message.includes('duplicate column name')) {
      console.error('Error al actualizar auth_users:', error.message);
    }
  });
  db.run('ALTER TABLE auth_users ADD COLUMN locked_until INTEGER', function(error) {
    if (error && !error.message.includes('duplicate column name')) {
      console.error('Error al actualizar auth_users:', error.message);
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      dni TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mozos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      turno TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cocineros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      especialidad TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      precio REAL NOT NULL CHECK (precio >= 0),
      tiempo_preparacion_min INTEGER NOT NULL CHECK (tiempo_preparacion_min >= 0),
      disponible INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_mesa INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
      fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cliente_id INTEGER,
      mozo_id INTEGER,
      cocinero_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (mozo_id) REFERENCES mozos(id),
      FOREIGN KEY (cocinero_id) REFERENCES cocineros(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);
});

module.exports = db;
