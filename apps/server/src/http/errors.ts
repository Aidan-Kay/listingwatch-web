import type { ApiErrorBody } from "@listingwatch/shared/schemas";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { isAbortError, MarketplaceError } from "../marketplaces/errors.ts";
import { AppError } from "../services/errors.ts";

/**
 * Every error becomes `{ error: { code, message } }`; unexpected ones are logged and hidden.
 * A request whose client went away (see `requestSignal`) is expected, not a failure.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((issue) => ({ path: issue.instancePath.replace(/^\//, "").replaceAll("/", "."), message: issue.message ?? "Invalid" }));
      return reply.code(400).send(body("invalid_request", issues[0]?.message ?? "Invalid request", issues));
    }
    if (error instanceof AppError) return reply.code(error.status).send(body(error.code, error.message));
    if (error instanceof MarketplaceError) return reply.code(502).send(body(`marketplace_${error.kind}`, error.message));
    if (isAbortError(error) && request.raw.destroyed) {
      request.log.debug("Client went away before the response was ready");
      return reply.code(499).send(body("client_closed", "The request was cancelled"));
    }
    if (error.statusCode !== undefined && error.statusCode < 500) return reply.code(error.statusCode).send(body(error.code ?? "bad_request", error.message));
    request.log.error({ err: error }, "Request failed");
    return reply.code(500).send(body("internal", "Something went wrong on the server"));
  });
}

function body(code: string, message: string, issues?: ApiErrorBody["error"]["issues"]): ApiErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } };
}
