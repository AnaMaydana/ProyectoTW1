import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [SupabaseModule, AuthModule, CartModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService]
})
export class OrdersModule {}
