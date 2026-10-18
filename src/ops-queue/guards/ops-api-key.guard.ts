import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AdminAuthGuard } from '../../admin-auth/guards/admin-auth.guard';

/**
 * Ops screens (kitchen, member desk, scan, timesheet) sign in with the same
 * admin email + password as admin-web and the admin dashboard, and send the
 * admin token as `Authorization: Bearer`. The shared `x-ops-api-key` is still
 * accepted so devices already signed in with it keep working until they sign
 * in again.
 */
@Injectable()
export class OpsApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly adminAuth: AdminAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const authz = req.headers.authorization;
    if (typeof authz === 'string' && authz.startsWith('Bearer ')) {
      // Same checks as every admin route: valid token, active account, and
      // signed out everywhere once the password changes.
      return this.adminAuth.canActivate(context);
    }

    const header = req.headers['x-ops-api-key'];
    const keyRaw = Array.isArray(header) ? header[0] : header;
    const key = (keyRaw ?? '').trim().replace(/^['"]|['"]$/g, '');
    const raw = this.config.get<string>('OPS_QUEUE_API_KEY', '');
    const allowed = raw
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (!key || !allowed.includes(key)) {
      throw new UnauthorizedException({
        code: 'OPS_QUEUE_UNAUTHORIZED',
        message: 'Sign in with your admin email and password.',
      });
    }
    return true;
  }
}
