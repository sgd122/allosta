import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingModule } from './booking/booking.module';
import { ConsultationModule } from './consultation/consultation.module';
import { CustomerModule } from './customer/customer.module';
import { TestResultModule } from './test-result/test-result.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { FamilyModule } from './family/family.module';
import { OpsSchedulerModule } from './ops-scheduler/ops-scheduler.module';
import { QaModule } from './qa/qa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Per-customer rate limiting for the QA write endpoints (ADR 0018). The
    // async factory runs at instantiation — after ConfigModule loads .env — so
    // the env overrides are honored (a static array would read process.env
    // before dotenv ran). Defaults: 30 writes / 60s, keyed by customerId via
    // QaThrottlerGuard. Only QA write handlers opt in; nothing else is throttled.
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: Number(process.env.QA_RATELIMIT_TTL) || 60_000,
          limit: Number(process.env.QA_RATELIMIT_LIMIT) || 30,
        },
      ],
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    // FEATURE MODULES
    AvailabilityModule,
    BookingModule,
    ConsultationModule,
    CustomerModule,
    TestResultModule,
    AnalyticsModule,
    NotificationModule,
    FamilyModule,
    OpsSchedulerModule,
    QaModule,
  ],
})
export class AppModule {}
