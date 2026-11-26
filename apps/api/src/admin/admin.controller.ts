import {
  Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, UseFilters, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { lowStockThreshold } from '../config/env';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminReportsService } from './admin-reports.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto } from './dto/product.dto';
import { LowStockDto, ReportRangeDto, TopProductsDto } from './dto/report.dto';

@Controller('admin')
@UseGuards(RolesGuard)
@UseFilters(AdminExceptionFilter)
@Roles('ADMIN')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private catalog: AdminCatalogService,
    private reports: AdminReportsService
  ) {}

  /** Auditoría: solo id_usuario y acción, nunca datos personales. */
  private audit(req: Request, action: string) {
    const id = (req as Request & { user?: { id?: string } }).user?.id ?? 'desconocido';
    this.logger.log(`${action} id_usuario=${id}`);
  }

  @Get('categories')
  async categories() { return { categories: await this.catalog.listCategories() }; }

  @Post('categories')
  async createCategory(@Req() req: Request, @Body() dto: CreateCategoryDto) {
    const category = await this.catalog.createCategory(dto.nombre);
    this.audit(req, 'crear_categoria');
    return { category };
  }

  @Patch('categories/:id')
  async updateCategory(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const category = await this.catalog.updateCategory(Number(id), dto);
    this.audit(req, 'editar_categoria');
    return { category };
  }

  @Get('products')
  async products(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return { products: await this.catalog.listProducts(category, includeInactive === 'true') };
  }

  @Post('products')
  async createProduct(@Req() req: Request, @Body() dto: CreateProductDto) {
    const product = await this.catalog.createProduct(dto);
    this.audit(req, 'crear_producto');
    return { product };
  }

  @Patch('products/:id')
  async updateProduct(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.catalog.updateProduct(Number(id), dto);
    this.audit(req, 'editar_producto');
    return { product };
  }

  @Delete('products/:id')
  async deleteProduct(@Req() req: Request, @Param('id') id: string) {
    const result = await this.catalog.deleteProduct(Number(id));
    this.audit(req, 'eliminar_producto');
    return result;
  }

  @Get('inventory')
  async inventory(@Query() query: LowStockDto) {
    return {
      items: await this.catalog.listInventory(query.threshold ?? lowStockThreshold())
    };
  }

  @Patch('inventory/:id')
  async updateInventory(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    const item = await this.catalog.updateInventory(Number(id), dto);
    this.audit(req, 'editar_inventario');
    return { item };
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
    return { rows: await this.reports.lowStock(query.threshold ?? lowStockThreshold()) };
  }
}
