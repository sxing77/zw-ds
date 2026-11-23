import 'server-only';
import { Pool } from 'pg';

let pool: Pool | undefined;

export function commerceDb() {
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 });
}
