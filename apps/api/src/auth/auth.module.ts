import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CookieService } from '../common/cookies/cookie.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, CookieService],
  exports: [AuthService, CookieService]
})
export class AuthModule {}
