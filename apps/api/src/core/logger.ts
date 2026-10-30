import pino, { type Logger } from 'pino';

export type { Logger };

/** Structured JSON logger. Sensitive fields are redacted so they can never leak into logs. */
export function createLogger(level: string): Logger {
    return pino({
        level,
        redact: {
            paths: [
                'password',
                '*.password',
                'passwordHash',
                '*.passwordHash',
                'apiKey',
                '*.apiKey',
                'secret',
                '*.secret',
                'token',
                '*.token',
                'req.headers.authorization',
            ],
            censor: '[REDACTED]',
        },
    });
}