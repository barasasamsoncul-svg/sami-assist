const fs = require("fs");
const { Pool } = require("pg");

const envFile = fs.readFileSync(".env.local", "utf8");

for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[match[1]] = value;
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
        b.id AS business_id,
        b.name AS business_name,
        b.slug AS business_slug,
        dr.database_name,
        dr.database_host,
        dr.database_port,
        dr.database_user,
        dr.status AS database_status
      FROM business_users bu
      INNER JOIN businesses b
        ON b.id = bu.business_id
      INNER JOIN database_registry dr
        ON dr.business_id = b.id
      WHERE b.status = 'active'
        AND dr.status = 'active'
      ORDER BY b.name
    `);

    console.table(result.rows);
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
})();
