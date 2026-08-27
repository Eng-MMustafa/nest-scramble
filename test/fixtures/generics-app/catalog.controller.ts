import { Controller, Get, Query } from '@nestjs/common';

export class ProductDto {
  id: number;
  name: string;
  price: number;
}

export class PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
}

export class PageQueryDto {
  page?: number;
  limit?: number;
}

@Controller('catalog')
export class CatalogController {
  @Get()
  async list(@Query() query: PageQueryDto): Promise<PaginatedDto<ProductDto>> {
    return { items: [], total: 0, page: query.page ?? 1 };
  }
}
