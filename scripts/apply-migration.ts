import { config as loadEnv } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const raw = readFileSync(join(process.cwd(), 'drizzle/0000_overrated_lionheart.sql'), 'utf-8');

// Fix: Drizzle customType wraps the type name in quotes (treats it as identifier).
// PostGIS needs the bare type expression. Strip the wrapping quotes.
const fixed = raw
  .replace(/"geography\(point, 4326\)"/g, 'geography(point, 4326)')
  .replace(/"geography\(linestring, 4326\)"/g, 'geography(linestring, 4326)');

const statements = fixed
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const sql = neon(url);

(async () => {
  for (const [i, stmt] of statements.entries()) {
    const preview = stmt.slice(0, 60).replace(/\s+/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
    try {
      await sql.query(stmt);
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error(e);
      process.exit(1);
    }
  }
  console.log('Migration applied.');
})();
