export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what, id) =>
  new HttpError(404, 'not_found', `${what} ${id} was not found on Genius.`);

export const badRequest = (message) =>
  new HttpError(400, 'bad_request', message);

export const upstream = (message, details) =>
  new HttpError(502, 'upstream_error', message, details);

export const timeout = (message) =>
  new HttpError(504, 'upstream_timeout', message);

export const rateLimited = (retryAfterSeconds) =>
  new HttpError(429, 'rate_limited', 'Too many requests. Slow down.', { retryAfterSeconds });
