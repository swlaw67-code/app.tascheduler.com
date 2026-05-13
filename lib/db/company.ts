// lib/db/company.ts
// Per-company database connections.
// Each company has its own MariaDB database.
// Uses fresh connections per request rather than pooling to avoid
// stale pool issues on Windows IIS/IISNode environments.

import mysql from 'mysql2/promise';

export interface DbConfig {
  db_name: string;
  db_user: string;
  db_pass: string;
}

// Map of db_name → connection pool
const companyPools = new Map<string, mysql.Pool>();

export function getCompanyDb(config: DbConfig): mysql.Pool {
  const existing = companyPools.get(config.db_name);
  if (existing) return existing;

  const host = process.env.MASTER_DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.MASTER_DB_PORT || '3306', 10);

  console.log(`[company.ts] Creating pool for db=${config.db_name} user=${config.db_user} host=${host}:${port}`);

  const pool = mysql.createPool({
    host,
    port,
    database:           config.db_name,
    user:               config.db_user,
    password:           config.db_pass,
    waitForConnections: true,
    connectionLimit:    5,
    queueLimit:         0,
    connectTimeout:     10000,
    enableKeepAlive:    true,
    keepAliveInitialDelay: 30000,
    timezone:           '+00:00',
  });

  companyPools.set(config.db_name, pool);
  return pool;
}

export async function companyQuery<T = mysql.RowDataPacket[]>(
  config: DbConfig,
  sql: string,
  params?: unknown[]
): Promise<T> {
  const pool = getCompanyDb(config);
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T;
  } catch (err) {
    console.error('[company.ts] Query error:', err);
    console.error('[company.ts] DB:', config.db_name, 'User:', config.db_user);
    console.error('[company.ts] Host:', process.env.MASTER_DB_HOST || '127.0.0.1');
    console.error('[company.ts] SQL:', sql);
    // Remove failed pool so next request creates a fresh one
    companyPools.delete(config.db_name);
    throw err;
  }
}
