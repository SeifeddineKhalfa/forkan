import { Body, Controller, Get, Patch } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type UpdateSettingsDto, updateSettingsSchema } from './settings.schemas.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Every signed-in role reads the templates (teachers send absence notices).
  @Get()
  get(@CurrentUser() actor: AuthUser) {
    return this.settings.get(actor);
  }

  @Roles('ADMIN')
  @Patch()
  update(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(updateSettingsSchema)) dto: UpdateSettingsDto) {
    return this.settings.update(actor, dto);
  }
}
