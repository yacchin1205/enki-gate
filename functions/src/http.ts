import type { Request } from "firebase-functions/v2/https";

export type JsonResponse = {
  status(code: number): JsonResponse;
  json(body: unknown): void;
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function readJsonBody<T>(request: Request): T {
  return request.body as T;
}

export function sendJsonError(response: JsonResponse, error: HttpError) {
  response.status(error.status).json({
    error: error.message,
  });
}
