import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../../core/errors';
import { JwtTokenService } from '../tokens';

const SECRET = 'x'.repeat(32);

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('JwtTokenService', () => {
    it('round-trips a user id', () => {
        const tokens = new JwtTokenService({ secret: SECRET, ttlSeconds: 60 });
        expect(tokens.verify(tokens.sign('user-1')).userId).toBe('user-1');
    });

    it('rejects an expired token', () => {
        const tokens = new JwtTokenService({ secret: SECRET, ttlSeconds: -10 });
        expect(() => tokens.verify(tokens.sign('user-1'))).toThrow(UnauthorizedError);
    });

    it('rejects a token signed with a different secret', () => {
        const a = new JwtTokenService({ secret: SECRET, ttlSeconds: 60 });
        const b = new JwtTokenService({ secret: 'y'.repeat(32), ttlSeconds: 60 });
        expect(() => b.verify(a.sign('user-1'))).toThrow(UnauthorizedError);
    });

    it('rejects a tampered token', () => {
        const tokens = new JwtTokenService({ secret: SECRET, ttlSeconds: 60 });
        const [header, payload, signature] = tokens.sign('user-1').split('.');
        const forgedPayload = base64url({ sub: 'admin' });
        expect(payload).not.toBe(forgedPayload);
        expect(() => tokens.verify(`${header}.${forgedPayload}.${signature}`)).toThrow(UnauthorizedError);
    });

    it('rejects an unsigned "alg: none" token', () => {
        const tokens = new JwtTokenService({ secret: SECRET, ttlSeconds: 60 });
        const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: 'user-1' })}.`;
        expect(() => tokens.verify(unsigned)).toThrow(UnauthorizedError);
    });
});