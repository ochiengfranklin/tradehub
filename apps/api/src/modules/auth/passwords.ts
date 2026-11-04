import argon2 from 'argon2';

export interface PasswordHasher {
    hash(plain: string): Promise<string>;
    verify(hash: string, plain: string): Promise<boolean>;
}

/** argon2id is the current recommended password hashing algorithm (slow and memory-hard on purpose). */
export class Argon2PasswordHasher implements PasswordHasher {
    async hash(plain: string): Promise<string> {
        return argon2.hash(plain, { type: argon2.argon2id });
    }

    async verify(hash: string, plain: string): Promise<boolean> {
        return argon2.verify(hash, plain);
    }
}