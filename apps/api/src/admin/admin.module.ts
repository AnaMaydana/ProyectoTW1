import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminReportsService } from './admin-reports.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminReportsService, RolesGuard]
})
export class AdminModule {}
