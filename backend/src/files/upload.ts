import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_UPLOAD_BYTES } from './files.service.js';

/** Single multipart field "file", kept in memory (≤ 5 MB) so its bytes can be checked before saving. */
export const SingleUpload = () =>
  applyDecorators(UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })));

/** Sends a private file: never cached by shared caches, never sniffed as another type. */
export function sendPrivateFile(res: Response, absolutePath: string) {
  res.set({ 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(absolutePath);
}
