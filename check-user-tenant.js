const fs = require("fs");
const { Pool } = require("pg");

const envFile = fs.readFileSync(".env.local", "utf8");

for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_ADMIN_USER,
  password: process.env.POSTGRES_ADMIN_PASSWORD,
  database: "sami_control",
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT
        bu.user_id,
        u.email,
        b.name AS business_name,
        b.id AS business_id,
        dr.database_name
      FROM business_users bu
      JOIN users u
        ON u.id = bu.user_id
      JOIN businesses b
        ON b.id = bu.business_id
      JOIN database_registry dr
        ON dr.business_id = b.id
      WHERE b.status = 'active'
        AND dr.status = 'active'
      ORDER BY b.name, u.email
    `);

    console.table(result.rows);
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
})();
