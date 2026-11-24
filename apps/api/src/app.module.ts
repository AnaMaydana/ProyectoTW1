import { Module } from '@nestjs/common';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';

@Module({ imports: [SupabaseModule, AuthModule, ProductsModule] })
export class AppModule {}
