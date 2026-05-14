const pool = require("./connection");

async function runMigrations() {
  try {

    // Sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) NOT NULL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        state VARCHAR(255),
        isOnline BOOLEAN DEFAULT FALSE,
        scope VARCHAR(255),
        accessToken VARCHAR(255),
        expires DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Sessions table ready");

    // Campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        shop VARCHAR(255) NOT NULL,
        discount_type ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
        discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
        discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
        status ENUM('scheduled','active','completed','cancelled') DEFAULT 'scheduled',
        start_time DATETIME NOT NULL,
        end_time DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Patch older campaigns tables that pre-date the discount_type/discount_value columns.
    await ensureColumn(pool, "campaigns", "discount_type",
      "ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage' AFTER shop");
    await ensureColumn(pool, "campaigns", "discount_value",
      "DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_percentage");
    await relaxNotNull(pool, "campaigns", "end_time", "DATETIME NULL");
    console.log("✅ Campaigns table ready");

    // Price snapshots table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        variant_id VARCHAR(255) NOT NULL,
        product_title VARCHAR(255),
        variant_title VARCHAR(255),
        sku VARCHAR(255),
        original_price DECIMAL(10,2) NOT NULL,
        sale_price DECIMAL(10,2) NOT NULL,
        compare_at_price DECIMAL(10,2),
        is_restored BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);
    console.log("✅ Price snapshots table ready");

    // Campaign variants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        variant_id VARCHAR(255) NOT NULL,
        product_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);
    console.log("✅ Campaign variants table ready");

    console.log("✅ All migrations completed");

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
  }
}

async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (rows[0].n === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  ↳ added column ${table}.${column}`);
  }
}

async function relaxNotNull(pool, table, column, definition) {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (rows.length && rows[0].IS_NULLABLE === "NO") {
    await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
    console.log(`  ↳ relaxed NOT NULL on ${table}.${column}`);
  }
}

module.exports = runMigrations;
