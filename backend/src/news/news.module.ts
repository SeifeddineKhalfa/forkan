import { Global, Module } from '@nestjs/common';
import { NewsController, PublicController } from './news.controller.js';
import { NewsService } from './news.service.js';
import { SiteRevalidator } from './site-revalidator.js';

@Global()
@Module({
  controllers: [NewsController, PublicController],
  providers: [NewsService, SiteRevalidator],
  exports: [SiteRevalidator],
})
export class NewsModule {}
