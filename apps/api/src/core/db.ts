import { Pool, type PoolClient } from 'pg';
import type { Logger } from './logger';

export type DbPool = Pool;
export type DbClient = PoolClient;

// NOTE: node-postgres returns NUMERIC columns as strings by default. That is exactly
// what we want: they go straight into decimal.js and never become JS floats.

export function createPool(databaseUrl: string, logger: Logger): DbPool {
    const pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
        logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
    });
    return pool;
}

/** Run `fn` in a transaction: commit on success, roll back on any error. */
export async function withTransaction<T>(
    pool: DbPool,
    fn: (client: DbClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    let brokenConnection: Error | undefined;
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            // If rollback itself fails the connection state is unknown: destroy it, don't reuse it.
            brokenConnection = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
        }
        throw err; // always surface the ORIGINAL error
    } finally {
        client.release(brokenConnection);
    }
}