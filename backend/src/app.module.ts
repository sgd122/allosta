import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingModule } from './booking/booking.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ConsultationModule } from './consultation/consultation.module';
import { CustomerModule } from './customer/customer.module';
import { TestResultModule } from './test-result/test-result.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { FamilyModule } from './family/family.module';
import { OpsSchedulerModule } from './ops-scheduler/ops-scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    // FEATURE MODULES
    AvailabilityModule,
    BookingModule,
    WaitlistModule,
    ConsultationModule,
    CustomerModule,
    TestResultModule,
    AnalyticsModule,
    NotificationModule,
    FamilyModule,
    OpsSchedulerModule,
  ],
})
export class AppModule {}
