import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Dev-only fallback — must match `.env.example` and the frontend verifier
      // fallback (frontend/src/shared/auth/verify.ts). Override in prod.
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-only-change-me-in-production',
    });
  }

  /**
   * Passport calls this with the verified payload; the return value becomes
   * `req.user`. We project JWT claims into the AuthenticatedUser shape used by
   * the ownership layer and @CurrentUser decorator.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      role: payload.role,
      customerId: payload.customerId,
      counselorId: payload.counselorId,
    };
  }
}
