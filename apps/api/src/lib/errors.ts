import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/**
 * Any error thrown with this class is rendered as a clean JSON body.
 * Anything else that escapes a route is treated as a 500 and logged.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static notFound(what: string) {
    return new HttpError(404, 'NOT_FOUND', `${what} not found`);
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }

  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }

  static payloadTooLarge(message: string) {
    return new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMedia(message: string) {
    return new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Turns a Zod failure into the `details` map the client renders inline. */
function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'Request body failed validation', details: zodDetails(err) },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // Multer signals an oversized upload with this code rather than an HttpError.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The uploaded presentation is too large' },
    });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } });
}
