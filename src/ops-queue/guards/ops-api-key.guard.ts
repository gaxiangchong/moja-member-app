import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class OpsApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-ops-api-key'];
    const keyRaw = Array.isArray(header) ? header[0] : header;
    const key = (keyRaw ?? '').trim().replace(/^['"]|['"]$/g, '');
    const raw = this.config.get<string>('OPS_QUEUE_API_KEY', '');
    const allowed = raw
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (!allowed.length) {
      throw new UnauthorizedException({
        code: 'OPS_QUEUE_NOT_CONFIGURED',
        message: 'OPS_QUEUE_API_KEY is not set on the server',
      });
    }
    if (!key || !allowed.includes(key)) {
      throw new UnauthorizedException({
        code: 'OPS_QUEUE_UNAUTHORIZED',
        message: 'Invalid ops queue API key',
      });
    }
    return true;
  }
}
