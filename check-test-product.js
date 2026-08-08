const fs = require("fs");
const { Pool } = require("pg");

const envFile = fs.readFileSync(".env.local", "utf8");

for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const config = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_ADMIN_USER,
  password: process.env.POSTGRES_ADMIN_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

const databases = [
  {
    business: "ACME LTD",
    database: "sami_tenant_147942905fa54d20ac2f6a2050e21343"
  },
  {
    business: "SaMi Technologies",
    database: "sami_tenant_6fed34d753db4e71b5e46d97f23126ca"
  }
];

(async () => {
  for (const tenant of databases) {
    const pool = new Pool({
      ...config,
      database: tenant.database
    });

    try {
      const result = await pool.query(`
        SELECT
          id,
          name,
          unit_price,
          cost_price,
          created_at
        FROM public.products
        WHERE name ILIKE 'Test Product'
        ORDER BY created_at DESC
      `);

      console.log("");
      console.log("========================================");
      console.log(tenant.business);
      console.log(tenant.database);
      console.log("========================================");

      if (result.rows.length === 0) {
        console.log("Test Product: NOT FOUND");
      } else {
        console.table(result.rows);
      }
    } catch (error) {
      console.error(`${tenant.business}:`, error.message);
    } finally {
      await pool.end();
    }
  }
})();
