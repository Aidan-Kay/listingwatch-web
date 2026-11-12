/** An error a client caused or can act on, mapped straight to an HTTP response. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function notFound(what: string): AppError {
  return new AppError(404, "not_found", `${what} not found`);
}

export function badRequest(message: string): AppError {
  return new AppError(400, "bad_request", message);
}
