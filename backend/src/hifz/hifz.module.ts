import { Module } from '@nestjs/common';
import { HifzController } from './hifz.controller.js';
import { HifzService } from './hifz.service.js';

@Module({
  controllers: [HifzController],
  providers: [HifzService],
})
export class HifzModule {}
