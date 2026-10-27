import 'dotenv/config';
import { Client } from 'pg';

/** Creates the test database if it does not exist yet. */
export default async function globalSetup(): Promise<void> {
  const testDb = process.env.TEST_DB_NAME ?? 'ledger_test';
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USER ?? 'ledger',
    password: process.env.DB_PASSWORD ?? 'ledger',
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
    if (!rowCount) await client.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await client.end();
  }
}
