import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z
    .object({
        email,
        // Length matters more than composition rules. Max length stops hashing-DoS with huge inputs.
        password: z.string().min(12, 'must be at least 12 characters').max(128),
    })
    .strict();

export const loginSchema = z
    .object({
        email,
        password: z.string().min(1).max(128),
    })
    .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;