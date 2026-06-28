import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { P } from '../admin-auth/permissions';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';
import { UpsertCalendarDaysDto } from './dto/upsert-calendar-days.dto';
import { PayrollPreviewDto } from './dto/payroll-preview.dto';
import { ListTimeEntriesQueryDto } from './dto/list-time-entries-query.dto';
import { CalendarRangeQueryDto } from './dto/calendar-range-query.dto';
import { EmployeesService } from '../employees/employees.service';

@Controller('admin/employees')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminEmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions(P.EMPLOYEE_READ)
  list() {
    return this.employees.listEmployees();
  }

  @Post()
  @RequirePermissions(P.EMPLOYEE_MANAGE)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.createEmployee(dto);
  }

  @Get('time-entries')
  @RequirePermissions(P.EMPLOYEE_READ)
  timeEntries(@Query() q: ListTimeEntriesQueryDto) {
    return this.employees.listTimeEntries(q);
  }

  @Get('calendar')
  @RequirePermissions(P.EMPLOYEE_READ)
  calendar(@Query() q: CalendarRangeQueryDto) {
    return this.employees.listCalendar(q.from, q.to);
  }

  @Post('calendar')
  @RequirePermissions(P.EMPLOYEE_MANAGE)
  upsertCalendar(@Body() dto: UpsertCalendarDaysDto) {
    return this.employees.upsertCalendarDays(dto.days);
  }

  @Get('payroll-settings')
  @RequirePermissions(P.EMPLOYEE_READ)
  payrollSettings() {
    return this.employees.getPayrollSettings();
  }

  @Patch('payroll-settings')
  @RequirePermissions(P.EMPLOYEE_MANAGE)
  patchPayrollSettings(@Body() dto: UpdatePayrollSettingsDto) {
    return this.employees.updatePayrollSettings(dto);
  }

  @Post('payroll-preview')
  @RequirePermissions(P.EMPLOYEE_READ)
  payrollPreview(@Body() dto: PayrollPreviewDto) {
    return this.employees.payrollPreview(dto);
  }

  @Patch(':id')
  @RequirePermissions(P.EMPLOYEE_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.updateEmployee(id, dto);
  }
}
