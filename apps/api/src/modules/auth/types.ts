export type UserStatus = 'active' | 'suspended';

/** Full database record. Contains the password hash, so it must never leave the auth module. */
export interface UserRecord {
    id: string;
    email: string;
    passwordHash: string;
    status: UserStatus;
    createdAt: Date;
}

/** What the outside world is allowed to see. */
export interface PublicUser {
    id: string;
    email: string;
    status: UserStatus;
    createdAt: Date;
}

/** Explicit field picking (not "delete passwordHash") so new sensitive columns can't leak by accident. */
export function toPublicUser(record: UserRecord): PublicUser {
    return {
        id: record.id,
        email: record.email,
        status: record.status,
        createdAt: record.createdAt,
    };
}