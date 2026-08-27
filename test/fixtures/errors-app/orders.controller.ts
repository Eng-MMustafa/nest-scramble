import {
  ConflictException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

class StubGuard {}

@Controller('orders')
export class OrdersController {
  @Get(':id')
  findOne(@Param('id') id: string): { id: string } {
    if (!id) {
      throw new NotFoundException('Order not found');
    }
    return { id };
  }

  @Post()
  create(): { id: string } {
    const exists = Math.random() > 0.5;
    if (exists) {
      throw new ConflictException();
    }
    if (!exists) {
      throw new HttpException('Order rejected', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    throw new HttpException('Legacy failure', 418);
  }

  @Get(':id/duplicate-status')
  duplicateStatus(@Param('id') id: string): { id: string } {
    if (id === 'a') {
      throw new NotFoundException('First message wins');
    }
    if (id === 'b') {
      throw new NotFoundException('Second message loses');
    }
    return { id };
  }

  @UseGuards(StubGuard)
  @Get('guarded')
  guarded(): string {
    throw new HttpException('Custom auth failure', 401);
  }

  @Get('clean')
  clean(): string {
    return 'no errors here';
  }
}
