import { Role } from '@prisma/client';

/**
 * JWT claims carried in every authenticated request.
 * `customerId` / `counselorId` are present only for the matching role and let
 * the ownership layer (AC7b) authorize resource access without extra lookups.
 */
export interface JwtPayload {
  sub: string; // User id
  role: Role;
  customerId?: string;
  counselorId?: string;
}

/**
 * The shape attached to `req.user` after JwtStrategy validation.
 */
export interface AuthenticatedUser {
  userId: string;
  role: Role;
  customerId?: string;
  counselorId?: string;
}
