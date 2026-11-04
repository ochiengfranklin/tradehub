import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from './app';
import { createLogger } from './core/logger';
import { JwtTokenService, createAuthModule } from './modules/auth';
import { FakePasswordHasher, InMemoryUserRepository } from './modules/auth/tests/helpers';

const PASSWORD = 'correct-horse-battery';

function buildApp(overrides: Partial<AppDeps> = {}) {
    const logger = createLogger('silent');
    const auth = createAuthModule({
        users: new InMemoryUserRepository(),
        hasher: new FakePasswordHasher(),
        tokens: new JwtTokenService({ secret: 'x'.repeat(32), ttlSeconds: 60 }),
        logger,
    });
    return createApp({ logger, auth, checkDatabase: async () => {}, ...overrides });
}

describe('health', () => {
    it('GET /health is ok', async () => {
        const res = await request(buildApp()).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /health/ready is 200 when the database is reachable', async () => {
        const res = await request(buildApp()).get('/health/ready');
        expect(res.status).toBe(200);
    });

    it('GET /health/ready is 503 when the database is down', async () => {
        const app = buildApp({
            checkDatabase: async () => {
                throw new Error('connection refused');
            },
        });
        const res = await request(app).get('/health/ready');
        expect(res.status).toBe(503);
    });
});

describe('auth API', () => {
    it('register, then use the token on a protected route', async () => {
        const app = buildApp();
        const registered = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'Trader@Example.com', password: PASSWORD });

        expect(registered.status).toBe(201);
        expect(registered.body.user.email).toBe('trader@example.com'); // normalized
        expect(JSON.stringify(registered.body)).not.toContain('hashed:'); // no hash leaked

        const me = await request(app)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${registered.body.token}`);
        expect(me.status).toBe(200);
        expect(me.body.user.email).toBe('trader@example.com');
    });

    it('login works and a wrong password is 401', async () => {
        const app = buildApp();
        await request(app).post('/api/v1/auth/register').send({ email: 'a@example.com', password: PASSWORD });

        const ok = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: PASSWORD });
        expect(ok.status).toBe(200);

        const bad = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrong-password-1' });
        expect(bad.status).toBe(401);
    });

    it('duplicate registration is 409', async () => {
        const app = buildApp();
        const body = { email: 'a@example.com', password: PASSWORD };
        await request(app).post('/api/v1/auth/register').send(body);
        const again = await request(app).post('/api/v1/auth/register').send(body);
        expect(again.status).toBe(409);
    });

    it('rejects invalid input with 400 and a VALIDATION_ERROR code', async () => {
        const app = buildApp();
        const badEmail = await request(app).post('/api/v1/auth/register').send({ email: 'nope', password: PASSWORD });
        expect(badEmail.status).toBe(400);
        expect(badEmail.body.error.code).toBe('VALIDATION_ERROR');

        const shortPassword = await request(app).post('/api/v1/auth/register').send({ email: 'a@example.com', password: 'short' });
        expect(shortPassword.status).toBe(400);

        const extraField = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'a@example.com', password: PASSWORD, status: 'admin' });
        expect(extraField.status).toBe(400);
    });

    it('rejects malformed JSON with 400', async () => {
        const res = await request(buildApp())
            .post('/api/v1/auth/register')
            .set('Content-Type', 'application/json')
            .send('{not json');
        expect(res.status).toBe(400);
    });

    it('protects /me', async () => {
        const app = buildApp();
        expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
        const garbage = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer garbage');
        expect(garbage.status).toBe(401);
    });

    it('rate-limits auth endpoints', async () => {
        const app = buildApp({ authRateLimit: { windowMs: 60_000, limit: 2 } });
        const attempt = () => request(app).post('/api/v1/auth/login').send({});
        expect((await attempt()).status).toBe(400);
        expect((await attempt()).status).toBe(400);
        expect((await attempt()).status).toBe(429);
    });
});

describe('errors', () => {
    it('unknown routes return a JSON 404', async () => {
        const res = await request(buildApp()).get('/nope');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('unexpected errors become a generic 500 with no internal details', async () => {
        const logger = createLogger('silent');
        const auth = createAuthModule({
            users: {
                create: async () => {
                    throw new Error('SECRET INTERNAL DB DETAILS');
                },
                findByEmail: async () => null,
                findById: async () => null,
            },
            hasher: new FakePasswordHasher(),
            tokens: new JwtTokenService({ secret: 'x'.repeat(32), ttlSeconds: 60 }),
            logger,
        });
        const app = createApp({ logger, auth, checkDatabase: async () => {} });
        const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@example.com', password: PASSWORD });
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('SECRET INTERNAL');
    });
});