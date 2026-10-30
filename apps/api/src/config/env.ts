import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates configuration once at startup. Taking `source` as a parameter
 * (instead of reading process.env directly) keeps this easy to test.
 * Fails fast with a readable message rather than crashing later.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
    const result = envSchema.safeParse(source);
    if (!result.success) {
        const problems = result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${problems}`);
    }
    return result.data;
}