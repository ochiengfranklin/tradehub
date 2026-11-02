import { ForbiddenError, UnauthorizedError } from '../../core/errors';
import type { Logger } from '../../core/logger';
import type { PasswordHasher } from './passwords';
import type { UserRepository } from './repository';
import type { LoginInput, RegisterInput } from './schemas';
import type { TokenService } from './tokens';
import { toPublicUser, type PublicUser } from './types';

export interface AuthResult {
    user: PublicUser;
    token: string;
}

export interface AuthServiceDeps {
    users: UserRepository;
    hasher: PasswordHasher;
    tokens: TokenService;
    logger: Logger;
}

// One message for "no such user" and "wrong password" so attackers can't discover which emails exist.
const INVALID_CREDENTIALS = 'Invalid email or password';

export class AuthService {
    private readonly deps: AuthServiceDeps;
    private dummyHash: Promise<string> | undefined;

    constructor(deps: AuthServiceDeps) {
        this.deps = deps;
    }

    async register(input: RegisterInput): Promise<AuthResult> {
        const passwordHash = await this.deps.hasher.hash(input.password);
        const record = await this.deps.users.create({ email: input.email, passwordHash });
        this.deps.logger.info({ userId: record.id }, 'User registered');
        return { user: toPublicUser(record), token: this.deps.tokens.sign(record.id) };
    }

    async login(input: LoginInput): Promise<AuthResult> {
        const record = await this.deps.users.findByEmail(input.email);

        if (!record) {
            // Do the same slow hashing work as a real check, so response TIME doesn't reveal unknown emails.
            this.dummyHash ??= this.deps.hasher.hash('timing-equalizer-not-a-real-password');
            await this.deps.hasher.verify(await this.dummyHash, input.password);
            throw new UnauthorizedError(INVALID_CREDENTIALS);
        }

        const passwordOk = await this.deps.hasher.verify(record.passwordHash, input.password);
        if (!passwordOk) {
            this.deps.logger.warn({ userId: record.id }, 'Failed login attempt');
            throw new UnauthorizedError(INVALID_CREDENTIALS);
        }

        // Checked only AFTER the password is proven, so strangers can't probe account status.
        if (record.status !== 'active') {
            throw new ForbiddenError('Account is suspended');
        }

        this.deps.logger.info({ userId: record.id }, 'User logged in');
        return { user: toPublicUser(record), token: this.deps.tokens.sign(record.id) };
    }

    async getCurrentUser(userId: string): Promise<PublicUser> {
        const record = await this.deps.users.findById(userId);
        if (!record || record.status !== 'active') {
            throw new UnauthorizedError('Account not available');
        }
        return toPublicUser(record);
    }
}