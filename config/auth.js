require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET. Copia .env.example a .env y define un valor.');
  process.exit(1);
}

module.exports = {
  jwtSecret: process.env.JWT_SECRET,
  maxFailedAttempts: 5,
  lockDurationMs: 5 * 60 * 1000
};
