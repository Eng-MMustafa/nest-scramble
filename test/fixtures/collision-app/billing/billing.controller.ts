import { Controller, Get } from '@nestjs/common';
import { StatusDto } from './status.dto';

@Controller('billing')
export class BillingController {
  @Get('status')
  status(): StatusDto {
    return { code: 402, reason: 'payment required', retryable: true };
  }
}
