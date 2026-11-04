import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { AppError, NotFoundError } from './core/errors';
import type { Logger } from './core/logger';
import type { AuthModule } from './modules/auth';

export interface AppDeps {
    logger: Logger;
    auth: AuthModule;
    /** Resolves if the database is reachable, rejects otherwise. */
    checkDatabase: () => Promise<void>;
    /** Override for tests. */
    authRateLimit?: { windowMs: number; limit: number };
}

/** Gives every request an ID (also returned as a header) and logs one line when it finishes. */
function requestContext(logger: Logger): RequestHandler {
    return (req, res, next) => {
        const requestId = randomUUID();
        res.locals.requestId = requestId;
        res.setHeader('x-request-id', requestId);
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
            logger.info(
                {
                    requestId,
                    method: req.method,
                    path: req.originalUrl.split('?')[0], // no query string: it could contain secrets
                    status: res.statusCode,
                    ms,
                },
                'request completed',
            );
        });
        next();
    };
}

/** Express body-parser errors (bad JSON, body too large) carry a 4xx `status`. */
function readClientErrorStatus(err: unknown): number | undefined {
    if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        typeof err.status === 'number' &&
        err.status >= 400 &&
        err.status < 500
    ) {
        return err.status;
    }
    return undefined;
}

function createErrorHandler(logger: Logger): ErrorRequestHandler {
    // Express only treats a handler as an error handler if it declares all 4 parameters.
    return (err: unknown, req, res, _next) => {
        const requestId: unknown = res.locals.requestId;

        if (err instanceof AppError) {
            if (err.httpStatus >= 500) {
                logger.error({ err, requestId }, 'Application error');
            }
            res.status(err.httpStatus).json({
                error: { code: err.code, message: err.message, details: err.details, requestId },
            });
            return;
        }

        const clientStatus = readClientErrorStatus(err);
        if (clientStatus !== undefined) {
            res.status(clientStatus).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: clientStatus === 413 ? 'Request body too large' : 'Malformed request',
                    requestId,
                },
            });
            return;
        }

        // A genuine bug. Log everything for us; reveal nothing to the client.
        logger.error({ err, requestId, path: req.path }, 'Unhandled error');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
        });
    };
}

export function createApp(deps: AppDeps): Express {
    const { logger } = deps;
    const app = express();

    app.use(helmet());
    app.use(requestContext(logger));
    app.use(express.json({ limit: '10kb' }));

    // Liveness: "is the process up?"  Readiness: "can it actually serve traffic (DB reachable)?"
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/health/ready', async (_req, res) => {
        try {
            await deps.checkDatabase();
            res.json({ status: 'ready' });
        } catch (err) {
            logger.error({ err }, 'Readiness check failed');
            res.status(503).json({ status: 'unavailable' });
        }
    });

    // Brute-force protection on auth endpoints.
    // (When deployed behind a proxy/load balancer, also set app.set('trust proxy', ...).)
    const authLimiter = rateLimit({
        windowMs: deps.authRateLimit?.windowMs ?? 15 * 60 * 1000,
        limit: deps.authRateLimit?.limit ?? 20,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({
                error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
            });
        },
    });
    app.use('/api/v1/auth', authLimiter, deps.auth.router);

    app.use((_req, _res, next) => {
        next(new NotFoundError('Route not found'));
    });
    app.use(createErrorHandler(logger));

    return app;
}