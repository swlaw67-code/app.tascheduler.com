// lib/db/master.ts
// Connection pool for the tas_master database

import mysql from 'mysql2/promise';

let masterPool: mysql.Pool | null = null;

export function getMasterDb(): mysql.Pool {
  if (!masterPool) {
    const host = process.env.MASTER_DB_HOST || '127.0.0.1';
    const port = parseInt(process.env.MASTER_DB_PORT || '3306', 10);
    const database = process.env.MASTER_DB_NAME || 'tas_master';
    const user = process.env.MASTER_DB_USER || '';
    const password = process.env.MASTER_DB_PASS || '';

    console.log(`[master.ts] Creating pool: host=${host} port=${port} db=${database} user=${user}`);

    masterPool = mysql.createPool({
      host,
      port,
      database,
      user,
      password,
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
      connectTimeout:     10000,
      enableKeepAlive:    true,
      keepAliveInitialDelay: 30000,
      timezone:           '+00:00',
    });
  }
  return masterPool;
}

export async function masterQuery<T = mysql.RowDataPacket[]>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const pool = getMasterDb();
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T;
  } catch (err) {
    console.error('[master.ts] Query error:', err);
    console.error('[master.ts] SQL:', sql);
    throw err;
  }
}
