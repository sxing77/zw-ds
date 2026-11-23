import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

if (process.loadEnvFile) {
  try { process.loadEnvFile('.env.local'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
  for (const name of files) {
    await db.query(await readFile(new URL(name, directory), 'utf8'));
  }
  console.log('Commerce schema ready.');
} finally {
  await db.end();
}
