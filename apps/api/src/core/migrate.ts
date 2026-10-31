import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DbPool } from './db';
import type { Logger } from './logger';

// Arbitrary constant. Stops two deploys from running migrations at the same time.
const MIGRATION_LOCK_ID = 727274;

/**
 * Applies every unapplied *.sql file (in filename order), each inside its own transaction.
 * Applied files are recorded in `schema_migrations`. Never edit an applied migration:
 * add a new numbered file instead.
 */
export async function runMigrations(
    pool: DbPool,
    migrationsDir: string,
    logger: Logger,
): Promise<string[]> {
    const client = await pool.connect();
    const applied: string[] = [];
    try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

        const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
        const alreadyApplied = new Set(rows.map((row) => row.name));
        const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

        for (const file of files) {
            if (alreadyApplied.has(file)) continue;
            const sql = await readFile(path.join(migrationsDir, file), 'utf8');
            logger.info({ migration: file }, 'Applying migration');
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
            } catch (err) {
                logger.error({ err, migration: file }, 'Migration failed; rolling back');
                await client.query('ROLLBACK');
                throw err;
            }
            applied.push(file);
        }
        return applied;
    } finally {
        // Destroy (not reuse) this connection: that also releases the advisory lock.
        client.release(true);
    }
}