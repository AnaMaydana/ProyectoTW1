import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminReportsService } from './admin-reports.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto } from './dto/product.dto';
import { LowStockDto, ReportRangeDto, TopProductsDto } from './dto/report.dto';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private catalog: AdminCatalogService,
    private reports: AdminReportsService
  ) {}

  @Get('categories')
  async categories() { return { categories: await this.catalog.listCategories() }; }

  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return { category: await this.catalog.createCategory(dto.nombre) };
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return { category: await this.catalog.updateCategory(Number(id), dto) };
  }

  @Get('products')
  async products(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return { products: await this.catalog.listProducts(category, includeInactive === 'true') };
  }

  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    return { product: await this.catalog.createProduct(dto) };
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return { product: await this.catalog.updateProduct(Number(id), dto) };
  }

  @Get('inventory')
  async inventory(@Query('threshold') threshold?: string) {
    return { items: await this.catalog.listInventory(threshold ? Number(threshold) : 5) };
  }

  @Patch('inventory/:id')
  async updateInventory(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return { item: await this.catalog.updateInventory(Number(id), dto) };
  }

  @Get('reports/sales')
  async sales(@Query() query: ReportRangeDto) {
    return { rows: await this.reports.sales(query.from, query.to) };
  }

  @Get('reports/top-products')
  async topProducts(@Query() query: TopProductsDto) {
    return { rows: await this.reports.topProducts(query.from, query.to, query.limit) };
  }

  @Get('reports/orders-by-status')
  async byStatus(@Query() query: ReportRangeDto) {
    return { rows: await this.reports.ordersByStatus(query.from, query.to) };
  }

  @Get('reports/low-stock')
  async lowStock(@Query() query: LowStockDto) {
    return { rows: await this.reports.lowStock(query.threshold) };
  }
}
