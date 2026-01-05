import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('companies')
  async getCompanies(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.adminService.getCompanies(parseInt(page), parseInt(limit));
  }

  @Post('companies/:id/approve')
  async approveCompany(@Param('id') id: string) {
    return this.adminService.approveCompany(id);
  }

  @Post('companies/:id/reject')
  async rejectCompany(@Param('id') id: string) {
    return this.adminService.rejectCompany(id);
  }

  @Get('activities')
  async getActivities() {
    return this.adminService.getActivities();
  }
}
