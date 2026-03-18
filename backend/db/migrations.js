const pool = require("./connection");

async function runMigrations() {
  try {

    // Campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        discount_percentage DECIMAL(5,2) NOT NULL,
        status ENUM('scheduled','active','completed','cancelled') DEFAULT 'scheduled',
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
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

module.exports = runMigrations;
