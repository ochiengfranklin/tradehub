import type { z } from 'zod';
import { ValidationError } from './errors';

/** Validate untrusted input at the boundary. Returns typed data or throws ValidationError. */
export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError('Invalid request', result.error.flatten());
    }
    return result.data;
}