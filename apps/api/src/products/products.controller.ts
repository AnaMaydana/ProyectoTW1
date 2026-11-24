import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  async list(@Query('search') search?: string, @Query('category') category?: string) {
    return { products: await this.products.list(search, category) };
  }
}
