import { Controller, Get } from '@nestjs/common';
import { StatusDto } from './status.dto';

@Controller('shipping')
export class ShippingController {
  @Get('status')
  status(): StatusDto {
    return { state: 'in-transit', updatedAt: new Date().toISOString() };
  }
}
