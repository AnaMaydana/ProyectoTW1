import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashierController } from './cashier.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CashierController],
  providers: [CashierService, RolesGuard]
})
export class CashierModule {}
