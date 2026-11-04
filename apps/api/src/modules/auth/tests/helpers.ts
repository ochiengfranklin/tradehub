import { randomUUID } from 'node:crypto';
import { ConflictError } from '../../../core/errors';
import type { PasswordHasher } from '../passwords';
import type { UserRepository } from '../repository';
import type { UserRecord, UserStatus } from '../types';

/** In-memory stand-in for PostgreSQL, so auth logic can be tested with no database. */
export class InMemoryUserRepository implements UserRepository {
    private readonly users = new Map<string, UserRecord>();

    async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
        const exists = [...this.users.values()].some((u) => u.email === input.email);
        if (exists) {
            throw new ConflictError('An account with this email already exists');
        }
        const record: UserRecord = {
            id: randomUUID(),
            email: input.email,
            passwordHash: input.passwordHash,
            status: 'active',
            createdAt: new Date(),
        };
        this.users.set(record.id, record);
        return record;
    }

    async findByEmail(email: string): Promise<UserRecord | null> {
        return [...this.users.values()].find((u) => u.email === email) ?? null;
    }

    async findById(id: string): Promise<UserRecord | null> {
        return this.users.get(id) ?? null;
    }

    /** Test-only helper. */
    setStatus(id: string, status: UserStatus): void {
        const user = this.users.get(id);
        if (user) user.status = status;
    }
}

/** Fast, deterministic fake. (Real argon2 is deliberately slow.) NOT secure; tests only. */
export class FakePasswordHasher implements PasswordHasher {
    async hash(plain: string): Promise<string> {
        return `hashed:${plain}`;
    }

    async verify(hash: string, plain: string): Promise<boolean> {
        return hash === `hashed:${plain}`;
    }
}