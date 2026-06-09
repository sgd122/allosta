import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    customerId?: string;
    counselorId?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verifies email + password against the bcrypt hash. Returns the user with
   * its linked customer/counselor profile, or throws 401.
   */
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { customer: true, counselor: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  /**
   * Issues a JWT carrying sub + role + the matching profile id so downstream
   * guards/ownership checks need no extra DB lookup.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.validateUser(email, password);

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      customerId: user.customer?.id,
      counselorId: user.counselor?.id,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customer?.id,
        counselorId: user.counselor?.id,
      },
    };
  }
}
