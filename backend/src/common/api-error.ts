import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * API errors carry a stable code the frontend translates (messages/ar.json → errors.*),
 * never a human sentence.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    readonly params?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, params }, status);
  }
}

export const notFound = (entity: string) =>
  new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', { entity });
