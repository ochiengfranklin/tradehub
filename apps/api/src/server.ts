import { createApp } from './app';
import { loadEnv } from './config/env';
import { createPool } from './core/db';
import { createLogger } from './core/logger';
import {
    Argon2PasswordHasher,
    JwtTokenService,
    PgUserRepository,
    createAuthModule,
} from './modules/auth';

async function main(): Promise<void> {
    const env = loadEnv();
    const logger = createLogger(env.LOG_LEVEL);
    const pool = createPool(env.DATABASE_URL, logger);

    const auth = createAuthModule({
        users: new PgUserRepository(pool),
        hasher: new Argon2PasswordHasher(),
        tokens: new JwtTokenService({ secret: env.JWT_SECRET, ttlSeconds: env.JWT_TTL_SECONDS }),
        logger,
    });

    const app = createApp({
        logger,
        auth,
        checkDatabase: async () => {
            await pool.query('SELECT 1');
        },
    });

    const server = app.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server listening');
    });

    // Graceful shutdown: stop accepting requests, finish in-flight ones, close DB connections.
    const shutdown = (signal: string): void => {
        logger.info({ signal }, 'Shutting down');
        setTimeout(() => {
            logger.error('Forced exit after shutdown timeout');
            process.exit(1);
        }, 10_000).unref();
        server.close((closeErr) => {
            pool.end().then(
                () => process.exit(closeErr ? 1 : 0),
                (endErr: unknown) => {
                    logger.error({ err: endErr }, 'Error closing database pool');
                    process.exit(1);
                },
            );
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // No silent failures: an unexpected error means unknown state, so log loudly and exit.
    process.on('unhandledRejection', (reason) => {
        logger.fatal({ err: reason }, 'Unhandled promise rejection');
        process.exit(1);
    });
    process.on('uncaughtException', (err) => {
        logger.fatal({ err }, 'Uncaught exception');
        process.exit(1);
    });
}

main().catch((err: unknown) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});