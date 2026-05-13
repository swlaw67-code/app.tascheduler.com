// test-db.js
// Run this from Plesk Node.js "Run Node.js commands" console:
//   node test-db.js
// Delete this file after debugging.

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

// Read .env.local manually
function readEnv() {
  const envPath = path.join(__dirname, '.env.local');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val   = trimmed.slice(eq + 1).trim();
      // Strip surrounding double quotes
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

async function test() {
  const env = readEnv();

  const host   = env.MASTER_DB_HOST || '127.0.0.1';
  const port   = parseInt(env.MASTER_DB_PORT || '3306', 10);
  const dbName = env.MASTER_DB_NAME || 'tas_master';
  const user   = env.MASTER_DB_USER || '';
  const pass   = env.MASTER_DB_PASS || '';

  console.log('=== TASScheduler DB Connection Test ===');
  console.log('Host:    ', host);
  console.log('Port:    ', port);
  console.log('Database:', dbName);
  console.log('User:    ', user);
  console.log('Pass:    ', pass ? '(set, length=' + pass.length + ')' : '(EMPTY - CHECK .env.local)');
  console.log('');

  // Test 1: master DB
  console.log('--- Test 1: Master DB (tas_master) ---');
  try {
    const conn = await mysql.createConnection({ host, port, database: dbName, user, password: pass });
    const [rows] = await conn.execute('SHOW TABLES');
    console.log('SUCCESS - Tables:', rows.length);
    const [companies] = await conn.execute('SELECT company_code, db_name, db_user FROM companies LIMIT 5');
    console.log('Companies:', JSON.stringify(companies));
    await conn.end();
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error('Error code:', err.code);
    console.error('Error number:', err.errno);
  }

  console.log('');

  // Test 2: company DB — reads first company from master
  console.log('--- Test 2: Company DB ---');
  try {
    const masterConn = await mysql.createConnection({ host, port, database: dbName, user, password: pass });
    const [companies] = await masterConn.execute('SELECT * FROM companies LIMIT 1');
    await masterConn.end();

    if (!companies.length) {
      console.log('No companies in master DB yet — skipping company DB test');
      return;
    }

    const company = companies[0];
    console.log('Testing company:', company.company_code);
    console.log('Company DB name:', company.db_name);
    console.log('Company DB user:', company.db_user);
    console.log('Company DB pass:', company.db_pass ? '(set, length=' + company.db_pass.length + ')' : '(EMPTY)');

    const compConn = await mysql.createConnection({
      host,
      port,
      database: company.db_name,
      user:     company.db_user,
      password: company.db_pass,
    });
    const [tables] = await compConn.execute('SHOW TABLES');
    console.log('SUCCESS - Company tables:', tables.length);
    const [skills] = await compConn.execute('SELECT * FROM skills LIMIT 5');
    console.log('Skills:', JSON.stringify(skills));
    await compConn.end();
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error('Error code:', err.code);
    console.error('Error number:', err.errno);
  }

  console.log('');
  console.log('=== Test complete ===');
}

test().catch(console.error);
