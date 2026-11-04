import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../../core/errors';
import { createLogger } from '../../../core/logger';
import { AuthService } from '../service';
import { JwtTokenService } from '../tokens';
import { FakePasswordHasher, InMemoryUserRepository } from './helpers';

const PASSWORD = 'correct-horse-battery';

function setup() {
    const users = new InMemoryUserRepository();
    const tokens = new JwtTokenService({ secret: 'x'.repeat(32), ttlSeconds: 60 });
    const service = new AuthService({
        users,
        hasher: new FakePasswordHasher(),
        tokens,
        logger: createLogger('silent'),
    });
    return { users, tokens, service };
}

describe('AuthService.register', () => {
    it('returns a public user and a valid token, never the password hash', async () => {
        const { service, tokens } = setup();
        const result = await service.register({ email: 'a@example.com', password: PASSWORD });

        expect(result.user.email).toBe('a@example.com');
        expect(result.user).not.toHaveProperty('passwordHash');
        expect(tokens.verify(result.token).userId).toBe(result.user.id);
    });

    it('stores a hash, not the plaintext password', async () => {
        const { service, users } = setup();
        await service.register({ email: 'a@example.com', password: PASSWORD });
        const stored = await users.findByEmail('a@example.com');
        expect(stored?.passwordHash).not.toBe(PASSWORD);
    });

    it('rejects a duplicate email', async () => {
        const { service } = setup();
        await service.register({ email: 'a@example.com', password: PASSWORD });
        await expect(
            service.register({ email: 'a@example.com', password: PASSWORD }),
        ).rejects.toBeInstanceOf(ConflictError);
    });
});

describe('AuthService.login', () => {
    it('logs in with correct credentials', async () => {
        const { service } = setup();
        await service.register({ email: 'a@example.com', password: PASSWORD });
        const result = await service.login({ email: 'a@example.com', password: PASSWORD });
        expect(result.token).toBeTruthy();
    });

    it('gives the SAME error for a wrong password and an unknown email', async () => {
        const { service } = setup();
        await service.register({ email: 'a@example.com', password: PASSWORD });

        const wrongPassword = await service
            .login({ email: 'a@example.com', password: 'not-the-password' })
            .catch((e: unknown) => e);
        const unknownEmail = await service
            .login({ email: 'nobody@example.com', password: PASSWORD })
            .catch((e: unknown) => e);

        expect(wrongPassword).toBeInstanceOf(UnauthorizedError);
        expect(unknownEmail).toBeInstanceOf(UnauthorizedError);
        expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
    });

    it('blocks suspended accounts', async () => {
        const { service, users } = setup();
        const { user } = await service.register({ email: 'a@example.com', password: PASSWORD });
        users.setStatus(user.id, 'suspended');
        await expect(
            service.login({ email: 'a@example.com', password: PASSWORD }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });
});

describe('AuthService.getCurrentUser', () => {
    it('rejects a user that no longer exists', async () => {
        const { service } = setup();
        await expect(service.getCurrentUser('missing-id')).rejects.toBeInstanceOf(UnauthorizedError);
    });
});