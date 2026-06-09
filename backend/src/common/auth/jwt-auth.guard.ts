import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Authentication layer: rejects unauthenticated requests with 401.
 * Backed by the passport `jwt` strategy.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
