import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookies are SameSite=Lax; on top of that every mutating request must carry
 * the X-Requested-With header, which a cross-site form cannot set.
 */
export function csrfHeaderCheck(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || req.get('x-requested-with')) return next();
  res.status(HttpStatus.FORBIDDEN).json({ statusCode: 403, code: 'CSRF_HEADER_MISSING' });
}
