const pool = require("./connection");

const mysqlSessionStorage = {
  async storeSession(session) {
    try {
      await pool.query(
        `INSERT INTO sessions (id, shop, state, isOnline, scope, accessToken, expires)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         shop=VALUES(shop), state=VALUES(state), isOnline=VALUES(isOnline),
         scope=VALUES(scope), accessToken=VALUES(accessToken), expires=VALUES(expires)`,
        [
          session.id,
          session.shop,
          session.state,
          session.isOnline,
          session.scope,
          session.accessToken,
          session.expires
        ]
      );
      return true;
    } catch (error) {
      console.error("❌ Store session error:", error.message);
      return false;
    }
  },

  async loadSession(id) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM sessions WHERE id = ?",
        [id]
      );
      if (rows.length === 0) return undefined;
      const row = rows[0];
      return {
        id: row.id,
        shop: row.shop,
        state: row.state,
        isOnline: row.isOnline,
        scope: row.scope,
        accessToken: row.accessToken,
        expires: row.expires
      };
    } catch (error) {
      console.error("❌ Load session error:", error.message);
      return undefined;
    }
  },

  async deleteSession(id) {
    try {
      await pool.query("DELETE FROM sessions WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("❌ Delete session error:", error.message);
      return false;
    }
  },

  async deleteSessions(ids) {
    try {
      await pool.query("DELETE FROM sessions WHERE id IN (?)", [ids]);
      return true;
    } catch (error) {
      console.error("❌ Delete sessions error:", error.message);
      return false;
    }
  },

  async findSessionsByShop(shop) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM sessions WHERE shop = ?",
        [shop]
      );
      return rows;
    } catch (error) {
      console.error("❌ Find sessions error:", error.message);
      return [];
    }
  }
};

module.exports = mysqlSessionStorage;
