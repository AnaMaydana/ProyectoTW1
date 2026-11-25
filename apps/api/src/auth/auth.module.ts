import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CookieService } from '../common/cookies/cookie.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [CartModule],
  controllers: [AuthController],
  providers: [AuthService, CookieService],
  exports: [AuthService, CookieService]
})
export class AuthModule {}
