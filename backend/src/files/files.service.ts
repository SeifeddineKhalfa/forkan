import { HttpStatus, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ApiError } from '../common/api-error.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/**
 * Private uploads (student photos, ijaza scans). Stored outside any public folder,
 * under <UPLOAD_DIR>/<schoolId>/<kind>/<uuid>.<ext>, and only served through
 * authenticated endpoints.
 */
@Injectable()
export class FilesService {
  readonly root = resolve(process.env.UPLOAD_DIR ?? 'uploads');

  /** Checks the real content type (magic bytes), writes the file, returns its relative path. */
  async store(schoolId: string, kind: string, buffer: Buffer | undefined, allowed: string[]) {
    if (!buffer?.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED');
    const type = await fileTypeFromBuffer(buffer);
    if (!type || !allowed.includes(type.mime)) {
      throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE');
    }
    const relative = join(schoolId, kind, `${randomUUID()}.${type.ext}`).replaceAll('\\', '/');
    const absolute = this.absolute(relative);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return relative;
  }

  /** For formats file-type cannot sniff (CSV): the caller has already checked the content. */
  async storeRaw(schoolId: string, kind: string, buffer: Buffer, ext: string) {
    const relative = join(schoolId, kind, `${randomUUID()}.${ext}`).replaceAll('\\', '/');
    const absolute = this.absolute(relative);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return relative;
  }

  read(relative: string) {
    return readFile(this.absolute(relative));
  }

  async remove(relative: string | null | undefined) {
    if (relative) await rm(this.absolute(relative), { force: true });
  }

  /** Resolves inside the upload root only (no path traversal). */
  absolute(relative: string) {
    const full = resolve(this.root, relative);
    if (!full.startsWith(this.root)) throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_PATH');
    return full;
  }
}
