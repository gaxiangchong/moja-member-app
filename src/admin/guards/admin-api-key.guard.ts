import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-admin-api-key'];
    const keyRaw = Array.isArray(header) ? header[0] : header;
    const key = (keyRaw ?? '').trim().replace(/^['"]|['"]$/g, '');
    const raw = this.config.get<string>('ADMIN_API_KEYS', '');
    const allowed = raw
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (!allowed.length) {
      throw new UnauthorizedException({
        code: 'ADMIN_NOT_CONFIGURED',
        message: 'Admin API is not configured',
      });
    }
    if (!key || !allowed.includes(key)) {
      throw new UnauthorizedException({
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Invalid admin credentials',
      });
    }
    return true;
  }
}
