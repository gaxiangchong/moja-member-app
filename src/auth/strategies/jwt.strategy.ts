import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../types/auth-user.type';
import type { AccessTokenJwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(
    payload: AccessTokenJwtPayload & { scope?: string },
  ): AuthUser {
    if (payload.scope === 'pin_setup') {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Use a member access token, not a PIN setup token.',
      });
    }
    if (typeof payload.sub !== 'string' || typeof payload.phoneE164 !== 'string') {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid token payload.',
      });
    }
    return {
      customerId: payload.sub,
      phoneE164: payload.phoneE164,
    };
  }
}
