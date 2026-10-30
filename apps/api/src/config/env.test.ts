import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const valid = {
    DATABASE_URL: 'postgres://tp:pw@localhost:5432/tp',
    JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
    it('applies defaults', () => {
        const env = loadEnv(valid);
        expect(env.PORT).toBe(3000);
        expect(env.NODE_ENV).toBe('development');
        expect(env.JWT_TTL_SECONDS).toBe(3600);
    });

    it('coerces numeric strings', () => {
        expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
    });

    it('fails fast and names the missing variable', () => {
        expect(() => loadEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL/);
    });

    it('rejects a short JWT secret', () => {
        expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    });
});