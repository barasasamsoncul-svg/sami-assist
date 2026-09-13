import { Pool, PoolClient } from 'pg';

let controlPool: Pool | null = null;

function shouldUseSsl() {
  const explicitSsl =
    process.env.POSTGRES_SSL?.trim().toLowerCase();

  if (explicitSsl === 'true') {
    return true;
  }

  if (explicitSsl === 'false') {
    return false;
  }

  const host =
    process.env.POSTGRES_HOST?.trim().toLowerCase() || '';

  // Neon and most hosted PostgreSQL providers require SSL.
  if (
    host.includes('neon.tech') ||
    host.includes('neon.build') ||
    host.includes('amazonaws.com') ||
    host.includes('render.com') ||
    host.includes('railway.app')
  ) {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

export function getControlPool(): Pool {
  if (!controlPool) {
    const useSsl = shouldUseSsl();

    controlPool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(
        process.env.POSTGRES_PORT || '5432',
        10
      ),
      user: process.env.POSTGRES_ADMIN_USER,
      password: process.env.POSTGRES_ADMIN_PASSWORD,
      database: process.env.POSTGRES_DB || 'sami_control',

      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,

      ssl: useSsl
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });

    controlPool.on('error', (err) => {
      console.error(
        'Control DB pool error:',
        err
      );
    });
  }

  return controlPool;
}

export async function queryControl(
  text: string,
  params?: any[]
) {
  const pool = getControlPool();

  const start = Date.now();

  const result =
    await pool.query(
      text,
      params
    );

  const duration =
    Date.now() - start;

  if (duration > 1000) {
    console.warn(
      `Slow query (${duration}ms): ${text.substring(
        0,
        100
      )}`
    );
  }

  return result;
}

export async function withControlTransaction<T>(
  callback: (
    client: PoolClient
  ) => Promise<T>
): Promise<T> {
  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    const result =
      await callback(
        client
      );

    await client.query(
      'COMMIT'
    );

    return result;
  } catch (error) {
    await client.query(
      'ROLLBACK'
    );

    throw error;
  } finally {
    client.release();
  }
}