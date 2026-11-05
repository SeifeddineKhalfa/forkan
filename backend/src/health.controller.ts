import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiError } from './common/api-error.js';
import { Public } from './common/decorators.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'DATABASE_UNAVAILABLE');
    }
    return { status: 'ok' };
  }
}
