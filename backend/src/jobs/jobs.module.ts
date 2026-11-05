import { Global, Module } from '@nestjs/common';
import { BossService } from './boss.service.js';

@Global()
@Module({
  providers: [BossService],
  exports: [BossService],
})
export class JobsModule {}
