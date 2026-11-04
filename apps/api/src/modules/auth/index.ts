/**
 * PUBLIC INTERFACE of the auth module. Other code imports ONLY from here.
 */
import type { RequestHandler, Router } from 'express';
import type { Logger } from '../../core/logger';
import { createRequireAuth } from './middleware';
import type { PasswordHasher } from './passwords';
import type { UserRepository } from './repository';
import { createAuthRouter } from './routes';
import { AuthService } from './service';
import type { TokenService } from './tokens';

export interface AuthModule {
    router: Router;
    requireAuth: RequestHandler;
}

export interface AuthModuleDeps {
    users: UserRepository;
    hasher: PasswordHasher;
    tokens: TokenService;
    logger: Logger;
}

export function createAuthModule(deps: AuthModuleDeps): AuthModule {
    const service = new AuthService(deps);
    const requireAuth = createRequireAuth(deps.tokens);
    return { router: createAuthRouter(service, requireAuth), requireAuth };
}

export { Argon2PasswordHasher } from './passwords';
export type { PasswordHasher } from './passwords';
export { PgUserRepository } from './repository';
export type { UserRepository } from './repository';
export { JwtTokenService } from './tokens';
export type { TokenService } from './tokens';