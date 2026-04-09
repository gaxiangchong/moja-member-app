import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminAuthState } from '../types/admin-auth.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAuthState => {
    const req = ctx.switchToHttp().getRequest<{ adminAuth: AdminAuthState }>();
    return req.adminAuth;
  },
);
