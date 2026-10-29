require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

// Kapcsolat-készlet: ezt használja minden route (pool.query(...))
const pool = mysql.createPool({
  host: process.env.db_host,
  user: process.env.db_user,
  password: process.env.db_password,
  database: process.env.db_database,
  port: process.env.db_port,
  waitForConnections: true,
  connectionLimit: 100,
});

module.exports = pool;
