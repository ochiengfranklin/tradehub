import type { DbPool } from '../../core/db';
import { ConflictError } from '../../core/errors';
import type { UserRecord, UserStatus } from './types';

/** The service depends on this interface, so tests can swap in an in-memory version. */
export interface UserRepository {
    create(input: { email: string; passwordHash: string }): Promise<UserRecord>;
    findByEmail(email: string): Promise<UserRecord | null>;
    findById(id: string): Promise<UserRecord | null>;
}

interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    status: UserStatus;
    created_at: Date;
}

const COLUMNS = 'id, email, password_hash, status, created_at';

function toRecord(row: UserRow): UserRecord {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        status: row.status,
        createdAt: row.created_at,
    };
}

function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

export class PgUserRepository implements UserRepository {
    private readonly pool: DbPool;

    constructor(pool: DbPool) {
        this.pool = pool;
    }

    async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
        try {
            // Parameterized query ($1, $2): user input is never concatenated into SQL.
            const { rows } = await this.pool.query<UserRow>(
                `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING ${COLUMNS}`,
                [input.email, input.passwordHash],
            );
            const row = rows[0];
            if (!row) {
                throw new Error('INSERT ... RETURNING produced no row');
            }
            return toRecord(row);
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictError('An account with this email already exists');
            }
            throw err;
        }
    }

    async findByEmail(email: string): Promise<UserRecord | null> {
        const { rows } = await this.pool.query<UserRow>(
            `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1)`,
            [email],
        );
        const row = rows[0];
        return row ? toRecord(row) : null;
    }

    async findById(id: string): Promise<UserRecord | null> {
        const { rows } = await this.pool.query<UserRow>(
            `SELECT ${COLUMNS} FROM users WHERE id = $1`,
            [id],
        );
        const row = rows[0];
        return row ? toRecord(row) : null;
    }
}