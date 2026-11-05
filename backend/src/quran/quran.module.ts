import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuranService } from './quran.service.js';

const metaQuery = z.object({ riwaya: z.enum(['QALUN', 'WARSH', 'HAFS']).default('QALUN') });

@Controller('quran')
class QuranController {
  constructor(private readonly quran: QuranService) {}

  @Get('meta')
  meta(@Query(new ZodValidationPipe(metaQuery)) q: z.infer<typeof metaQuery>) {
    return this.quran.meta(q.riwaya);
  }
}

@Global()
@Module({
  controllers: [QuranController],
  providers: [QuranService],
  exports: [QuranService],
})
export class QuranModule {}
