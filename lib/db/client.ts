import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let cached: ReturnType<typeof drizzle> | null = null;
export function getDb() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  cached = drizzle(neon(url), { schema });
  return cached;
}

// Backward-compat: export `db` as a Proxy so existing code works
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, key) {
    return (getDb() as any)[key];
  },
});
