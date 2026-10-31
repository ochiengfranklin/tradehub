import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../core/db';
import { createLogger } from '../core/logger';
import { runMigrations } from '../core/migrate';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

async function main(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required');
    }
    const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
    const pool = createPool(databaseUrl, logger);
    try {
        const applied = await runMigrations(pool, migrationsDir, logger);
        logger.info({ applied }, applied.length > 0 ? 'Migrations complete' : 'Database already up to date');
    } finally {
        await pool.end();
    }
}

main().catch((err: unknown) => {
    console.error('Migration failed:', err);
    process.exit(1);
});