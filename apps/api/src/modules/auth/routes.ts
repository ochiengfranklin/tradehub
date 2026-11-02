import { Router, type RequestHandler } from 'express';
import { UnauthorizedError } from '../../core/errors';
import { parseWith } from '../../core/validation';
import { loginSchema, registerSchema } from './schemas';
import type { AuthService } from './service';

export function createAuthRouter(service: AuthService, requireAuth: RequestHandler): Router {
    const router = Router();

    // Express 5 forwards errors from async handlers to the error middleware automatically.
    router.post('/register', async (req, res) => {
        const input = parseWith(registerSchema, req.body);
        res.status(201).json(await service.register(input));
    });

    router.post('/login', async (req, res) => {
        const input = parseWith(loginSchema, req.body);
        res.json(await service.login(input));
    });

    router.get('/me', requireAuth, async (req, res) => {
        const userId = req.auth?.userId;
        if (!userId) {
            throw new UnauthorizedError();
        }
        res.json({ user: await service.getCurrentUser(userId) });
    });

    return router;
}