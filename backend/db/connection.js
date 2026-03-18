const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log("✅ MySQL Connected Successfully");
      connection.release();
      return true;
    } catch (error) {
      console.log(`⏳ MySQL not ready, retrying in ${delay/1000}s... (${i + 1}/${retries})`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error("❌ MySQL Connection Failed after all retries");
  return false;
}

testConnection();

module.exports = pool;
