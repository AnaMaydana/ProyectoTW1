import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CookieService } from '../common/cookies/cookie.service';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [CartController],
  providers: [CartService, CookieService],
  exports: [CartService, CookieService]
})
export class CartModule {}
