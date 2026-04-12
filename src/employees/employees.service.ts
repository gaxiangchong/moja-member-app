import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Employee,
  Prisma,
  WorkCalendarDayType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDayStart(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePayrollSettings() {
    await this.prisma.payrollSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async clockIn(employeeCodeRaw: string) {
    const employeeCode = employeeCodeRaw.trim();
    if (!employeeCode) {
      throw new BadRequestException({
        code: 'EMPLOYEE_CODE_REQUIRED',
        message: 'Employee ID is required',
      });
    }
    const emp = await this.prisma.employee.findFirst({
      where: {
        employeeCode: { equals: employeeCode, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (!emp) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'No active employee matches that ID',
      });
    }
    const open = await this.prisma.employeeTimeEntry.findFirst({
      where: { employeeId: emp.id, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (open) {
      throw new BadRequestException({
        code: 'ALREADY_CLOCKED_IN',
        message: 'Already clocked in — clock out first',
      });
    }
    const entry = await this.prisma.employeeTimeEntry.create({
      data: {
        employeeId: emp.id,
        clockInAt: new Date(),
      },
    });
    return {
      ok: true,
      employee: {
        id: emp.id,
        employeeCode: emp.employeeCode,
        displayName: emp.displayName,
      },
      entry: {
        id: entry.id,
        clockInAt: entry.clockInAt.toISOString(),
      },
    };
  }

  async clockOut(employeeCodeRaw: string) {
    const employeeCode = employeeCodeRaw.trim();
    if (!employeeCode) {
      throw new BadRequestException({
        code: 'EMPLOYEE_CODE_REQUIRED',
        message: 'Employee ID is required',
      });
    }
    const emp = await this.prisma.employee.findFirst({
      where: {
        employeeCode: { equals: employeeCode, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (!emp) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'No active employee matches that ID',
      });
    }
    const open = await this.prisma.employeeTimeEntry.findFirst({
      where: { employeeId: emp.id, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) {
      throw new BadRequestException({
        code: 'NOT_CLOCKED_IN',
        message: 'No open clock-in for this employee',
      });
    }
    const now = new Date();
    const updated = await this.prisma.employeeTimeEntry.update({
      where: { id: open.id },
      data: { clockOutAt: now },
    });
    return {
      ok: true,
      employee: {
        id: emp.id,
        employeeCode: emp.employeeCode,
        displayName: emp.displayName,
      },
      entry: {
        id: updated.id,
        clockInAt: updated.clockInAt.toISOString(),
        clockOutAt: updated.clockOutAt!.toISOString(),
      },
    };
  }

  async listEmployees() {
    const rows = await this.prisma.employee.findMany({
      orderBy: { employeeCode: 'asc' },
    });
    return rows.map((e) => this.serializeEmployee(e));
  }

  async createEmployee(dto: {
    employeeCode: string;
    displayName: string;
    positionTitle?: string;
    hourlyRateCents?: number;
    commissionRateBps?: number;
  }) {
    const code = dto.employeeCode.trim();
    if (!code || !dto.displayName.trim()) {
      throw new BadRequestException({
        code: 'EMPLOYEE_FIELDS',
        message: 'employeeCode and displayName are required',
      });
    }
    try {
      const e = await this.prisma.employee.create({
        data: {
          employeeCode: code,
          displayName: dto.displayName.trim(),
          positionTitle: (dto.positionTitle ?? '').trim(),
          hourlyRateCents: dto.hourlyRateCents ?? 0,
          commissionRateBps: dto.commissionRateBps ?? 0,
        },
      });
      return this.serializeEmployee(e);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: 'DUPLICATE_CODE',
          message: 'That employee ID is already in use',
        });
      }
      throw e;
    }
  }

  async updateEmployee(
    id: string,
    dto: {
      displayName?: string;
      positionTitle?: string;
      hourlyRateCents?: number;
      commissionRateBps?: number;
      isActive?: boolean;
    },
  ) {
    await this.getEmployeeOrThrow(id);
    const e = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.displayName != null
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.positionTitle != null
          ? { positionTitle: dto.positionTitle.trim() }
          : {}),
        ...(dto.hourlyRateCents != null
          ? { hourlyRateCents: dto.hourlyRateCents }
          : {}),
        ...(dto.commissionRateBps != null
          ? { commissionRateBps: dto.commissionRateBps }
          : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
    return this.serializeEmployee(e);
  }

  private async getEmployeeOrThrow(id: string): Promise<Employee> {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee not found',
      });
    }
    return e;
  }

  private serializeEmployee(e: Employee) {
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      displayName: e.displayName,
      positionTitle: e.positionTitle,
      hourlyRateCents: e.hourlyRateCents,
      commissionRateBps: e.commissionRateBps,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async listTimeEntries(query: {
    from?: string;
    to?: string;
    employeeId?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const where: Prisma.EmployeeTimeEntryWhereInput = {};
    if (query.employeeId?.trim()) {
      where.employeeId = query.employeeId.trim();
    }
    if (query.from || query.to) {
      where.clockInAt = {};
      if (query.from) where.clockInAt.gte = utcDayStart(query.from);
      if (query.to) {
        const end = utcDayStart(query.to);
        end.setUTCDate(end.getUTCDate() + 1);
        where.clockInAt.lt = end;
      }
    }
    const rows = await this.prisma.employeeTimeEntry.findMany({
      where,
      take,
      orderBy: { clockInAt: 'desc' },
      include: { employee: true },
    });
    return {
      entries: rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeCode: r.employee.employeeCode,
        displayName: r.employee.displayName,
        positionTitle: r.employee.positionTitle,
        clockInAt: r.clockInAt.toISOString(),
        clockOutAt: r.clockOutAt?.toISOString() ?? null,
        minutesWorked:
          r.clockOutAt != null
            ? Math.max(
                0,
                Math.round(
                  (r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60_000,
                ),
              )
            : null,
      })),
    };
  }

  async listCalendar(from: string, to: string) {
    const start = utcDayStart(from);
    const end = utcDayStart(to);
    end.setUTCDate(end.getUTCDate() + 1);
    const days = await this.prisma.workCalendarDay.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
    return {
      days: days.map((d) => ({
        id: d.id,
        date: isoDateOnly(d.date),
        dayType: d.dayType,
        label: d.label,
      })),
    };
  }

  async upsertCalendarDays(
    items: { date: string; dayType: WorkCalendarDayType; label?: string }[],
  ) {
    for (const it of items) {
      const d = utcDayStart(it.date);
      await this.prisma.workCalendarDay.upsert({
        where: { date: d },
        create: {
          date: d,
          dayType: it.dayType,
          label: it.label?.trim() || null,
        },
        update: {
          dayType: it.dayType,
          label: it.label?.trim() || null,
        },
      });
    }
    return { ok: true, count: items.length };
  }

  async getPayrollSettings() {
    await this.ensurePayrollSettings();
    const s = await this.prisma.payrollSettings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    return {
      id: s.id,
      standardWorkdayMinutes: s.standardWorkdayMinutes,
      overtimeMultiplierBps: s.overtimeMultiplierBps,
      publicHolidayMultiplierBps: s.publicHolidayMultiplierBps,
      offDayWorkedMultiplierBps: s.offDayWorkedMultiplierBps,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async updatePayrollSettings(dto: {
    standardWorkdayMinutes?: number;
    overtimeMultiplierBps?: number;
    publicHolidayMultiplierBps?: number;
    offDayWorkedMultiplierBps?: number;
  }) {
    await this.ensurePayrollSettings();
    const s = await this.prisma.payrollSettings.update({
      where: { id: 'default' },
      data: {
        ...(dto.standardWorkdayMinutes != null
          ? { standardWorkdayMinutes: dto.standardWorkdayMinutes }
          : {}),
        ...(dto.overtimeMultiplierBps != null
          ? { overtimeMultiplierBps: dto.overtimeMultiplierBps }
          : {}),
        ...(dto.publicHolidayMultiplierBps != null
          ? { publicHolidayMultiplierBps: dto.publicHolidayMultiplierBps }
          : {}),
        ...(dto.offDayWorkedMultiplierBps != null
          ? { offDayWorkedMultiplierBps: dto.offDayWorkedMultiplierBps }
          : {}),
      },
    });
    return {
      id: s.id,
      standardWorkdayMinutes: s.standardWorkdayMinutes,
      overtimeMultiplierBps: s.overtimeMultiplierBps,
      publicHolidayMultiplierBps: s.publicHolidayMultiplierBps,
      offDayWorkedMultiplierBps: s.offDayWorkedMultiplierBps,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async payrollPreview(input: {
    employeeId: string;
    from: string;
    to: string;
    manualCommissionCents?: number;
  }) {
    await this.ensurePayrollSettings();
    const settings = await this.prisma.payrollSettings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    const emp = await this.getEmployeeOrThrow(input.employeeId);
    const fromD = utcDayStart(input.from);
    const toEx = utcDayStart(input.to);
    toEx.setUTCDate(toEx.getUTCDate() + 1);

    const entries = await this.prisma.employeeTimeEntry.findMany({
      where: {
        employeeId: emp.id,
        clockOutAt: { not: null },
        clockInAt: { gte: fromD, lt: toEx },
      },
      orderBy: { clockInAt: 'asc' },
    });

    const calendarRows = await this.prisma.workCalendarDay.findMany({
      where: { date: { gte: fromD, lt: toEx } },
    });
    const calendarMap = new Map<string, WorkCalendarDayType>();
    for (const c of calendarRows) {
      calendarMap.set(isoDateOnly(c.date), c.dayType);
    }

    type DayAgg = {
      date: string;
      dayType: WorkCalendarDayType;
      minutes: number;
    };
    const byDay = new Map<string, DayAgg>();

    for (const en of entries) {
      if (!en.clockOutAt) continue;
      const mins = Math.max(
        0,
        Math.round(
          (en.clockOutAt.getTime() - en.clockInAt.getTime()) / 60_000,
        ),
      );
      const dayKey = isoDateOnly(en.clockInAt);
      const dayType =
        calendarMap.get(dayKey) ?? WorkCalendarDayType.REGULAR;
      const cur = byDay.get(dayKey) ?? {
        date: dayKey,
        dayType,
        minutes: 0,
      };
      cur.minutes += mins;
      cur.dayType = dayType;
      byDay.set(dayKey, cur);
    }

    const std = Math.max(1, settings.standardWorkdayMinutes);
    const otBps = settings.overtimeMultiplierBps;
    const phBps = settings.publicHolidayMultiplierBps;
    const offBps = settings.offDayWorkedMultiplierBps;
    const hourly = emp.hourlyRateCents;

    const lines: {
      date: string;
      dayType: WorkCalendarDayType;
      minutesWorked: number;
      regularMinutes: number;
      overtimeMinutes: number;
      payCents: number;
    }[] = [];

    let totalPayCents = 0;
    let straightTimeEquivalentCents = 0;

    for (const [, agg] of [...byDay.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const m = agg.minutes;
      straightTimeEquivalentCents += Math.round((m / 60) * hourly);
      let pay = 0;
      let regM = 0;
      let otM = 0;
      if (agg.dayType === WorkCalendarDayType.PUBLIC_HOLIDAY) {
        pay = Math.round((m / 60) * hourly * (phBps / 10_000));
        regM = m;
      } else if (agg.dayType === WorkCalendarDayType.OFF) {
        regM = Math.min(m, std);
        otM = Math.max(0, m - std);
        const baseReg = Math.round((regM / 60) * hourly);
        const baseOt = Math.round((otM / 60) * hourly * (otBps / 10_000));
        pay = Math.round((baseReg + baseOt) * (offBps / 10_000));
      } else {
        regM = Math.min(m, std);
        otM = Math.max(0, m - std);
        pay =
          Math.round((regM / 60) * hourly) +
          Math.round((otM / 60) * hourly * (otBps / 10_000));
      }
      totalPayCents += pay;
      lines.push({
        date: agg.date,
        dayType: agg.dayType,
        minutesWorked: m,
        regularMinutes: regM,
        overtimeMinutes: otM,
        payCents: pay,
      });
    }

    const commissionFromRate = Math.round(
      (totalPayCents * emp.commissionRateBps) / 10_000,
    );
    const manualExtra = Math.max(0, input.manualCommissionCents ?? 0);
    const commissionTotalCents = commissionFromRate + manualExtra;
    const grandTotalCents = totalPayCents + commissionTotalCents;
    const rulesPremiumPayCents = Math.max(
      0,
      totalPayCents - straightTimeEquivalentCents,
    );

    return {
      employee: this.serializeEmployee(emp),
      period: { from: input.from.slice(0, 10), to: input.to.slice(0, 10) },
      settings: {
        standardWorkdayMinutes: settings.standardWorkdayMinutes,
        overtimeMultiplierBps: settings.overtimeMultiplierBps,
        publicHolidayMultiplierBps: settings.publicHolidayMultiplierBps,
        offDayWorkedMultiplierBps: settings.offDayWorkedMultiplierBps,
      },
      lines,
      breakdown: {
        straightTimePayCents: straightTimeEquivalentCents,
        rulesPremiumPayCents,
      },
      hourlyPayCents: totalPayCents,
      commissionFromRateBpsCents: commissionFromRate,
      manualCommissionCents: manualExtra,
      commissionTotalCents,
      grandTotalCents,
      notes:
        'Commission = (wage subtotal × employee percentage / 100) + optional manual add-on. Wage subtotal includes overtime, public holiday, and off-day multipliers.',
    };
  }
}
