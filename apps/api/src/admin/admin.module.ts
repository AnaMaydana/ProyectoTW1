import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminReportsService } from './admin-reports.service';
import { PhotoStorageService } from './photo-storage.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminReportsService, PhotoStorageService, RolesGuard]
})
export class AdminModule {}
