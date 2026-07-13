export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_SERVER_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  public readonly errors?: unknown[];

  constructor(message: string, errors?: unknown[]) {
    super(message, 400, "BAD_REQUEST_VALIDATION");
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication credentials invalid or expired") {
    super(message, 401, "UNAUTHORIZED_ACCESS");
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "You do not have permission to access this resource") {
    super(message, 403, "FORBIDDEN_RESOURCE");
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests. Please try again later.") {
    super(message, 429, "TOO_MANY_REQUESTS");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "TRANSACTION_CONFLICT");
  }
}
