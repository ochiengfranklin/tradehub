import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../core/errors';
import type { TokenService } from './tokens';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set by requireAuth on protected routes. */
        auth?: { userId: string };
    }
}

export function createRequireAuth(tokens: TokenService): RequestHandler {
    return (req, _res, next) => {
        const header = req.header('authorization');
        const match = header ? /^Bearer (.+)$/i.exec(header) : null;
        const token = match?.[1];
        if (!token) {
            next(new UnauthorizedError('Missing bearer token'));
            return;
        }
        try {
            req.auth = tokens.verify(token);
            next();
        } catch (err) {
            next(err);
        }
    };
}