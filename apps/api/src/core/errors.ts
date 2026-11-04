/**
 * Typed errors. Services throw these; the HTTP layer maps them to responses.
 * Anything that is NOT an AppError is treated as a bug (logged, generic 500).
 */
export class AppError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly details: unknown;

    constructor(
        code: string,
        message: string,
        httpStatus: number,
        details?: unknown,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Invalid request', details?: unknown) {
        super('VALIDATION_ERROR', message, 400, details);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized', options?: ErrorOptions) {
        super('UNAUTHORIZED', message, 401, undefined, options);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super('FORBIDDEN', message, 403);
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Not found') {
        super('NOT_FOUND', message, 404);
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Conflict') {
        super('CONFLICT', message, 409);
    }
}