import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [DatabaseModule, AuthModule, ProductsModule, CartModule, OrdersModule, AdminModule]
})
export class AppModule {}
