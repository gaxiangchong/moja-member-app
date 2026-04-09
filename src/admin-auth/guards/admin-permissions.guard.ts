import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { P } from '../permissions';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AdminAuthState } from '../types/admin-auth.types';

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!required.length) return true;

    const req = context.switchToHttp().getRequest<{ adminAuth?: AdminAuthState }>();
    const auth = req.adminAuth;
    if (!auth) {
      throw new ForbiddenException({ code: 'ADMIN_AUTH_MISSING', message: 'Not authenticated' });
    }
    if (auth.isSuper || auth.permissions.has(P.ALL)) return true;

    for (const p of required) {
      if (!auth.permissions.has(p)) {
        throw new ForbiddenException({
          code: 'ADMIN_FORBIDDEN',
          message: `Missing permission: ${p}`,
        });
      }
    }
    return true;
  }
}
