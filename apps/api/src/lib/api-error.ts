/**
 * Typed API error — throw from any route handler and the
 * error-handler middleware will format it into ApiResponse.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  // ── Convenience factories ────────────────────────

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new ApiError(403, code, message);
  }

  static notFound(message = "Resource not found", code = "NOT_FOUND") {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(
    message = "Too many requests — please slow down",
    code = "RATE_LIMIT_EXCEEDED",
  ) {
    return new ApiError(429, code, message);
  }

  static internal(
    message = "Internal server error",
    code = "INTERNAL_SERVER_ERROR",
  ) {
    return new ApiError(500, code, message);
  }
}
