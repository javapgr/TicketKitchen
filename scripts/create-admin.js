var bcrypt = require('bcryptjs');
var db = require('../bd');

var email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
var password = process.env.ADMIN_PASSWORD || '';

if (!email || !password) {
  console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD antes de crear el administrador.');
  process.exitCode = 1;
} else if (password.length < 8) {
  console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
  process.exitCode = 1;
} else {
  var passwordHash = bcrypt.hashSync(password, 12);
  db.run(
    'INSERT INTO auth_users (email, password_hash, role) VALUES (?, ?, ?)',
    [email, passwordHash, 'admin'],
    function(error) {
      if (error) {
        console.error(error.code === 'SQLITE_CONSTRAINT' ? 'Ese correo ya existe.' : error.message);
        process.exitCode = 1;
      } else {
        console.log('Administrador creado:', email);
      }
      db.close();
    }
  );
}
