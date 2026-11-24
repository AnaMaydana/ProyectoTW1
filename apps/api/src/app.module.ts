import { Module } from '@nestjs/common';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';

@Module({ imports: [SupabaseModule, AuthModule, ProductsModule, CartModule] })
export class AppModule {}
