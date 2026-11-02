import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../core/errors';

export interface TokenService {
    sign(userId: string): string;
    verify(token: string): { userId: string };
}

export class JwtTokenService implements TokenService {
    private readonly secret: string;
    private readonly ttlSeconds: number;

    constructor(options: { secret: string; ttlSeconds: number }) {
        this.secret = options.secret;
        this.ttlSeconds = options.ttlSeconds;
    }

    sign(userId: string): string {
        return jwt.sign({}, this.secret, {
            subject: userId,
            algorithm: 'HS256',
            expiresIn: this.ttlSeconds,
        });
    }

    verify(token: string): { userId: string } {
        try {
            // Pinning `algorithms` blocks the classic "alg: none" and algorithm-confusion attacks.
            const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
            if (typeof payload === 'string' || typeof payload.sub !== 'string') {
                throw new UnauthorizedError('Invalid token');
            }
            return { userId: payload.sub };
        } catch (err) {
            if (err instanceof UnauthorizedError) throw err;
            throw new UnauthorizedError('Invalid or expired token', { cause: err });
        }
    }
}