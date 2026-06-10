import { Module } from '@nestjs/common';
import { TestResultController } from './test-result.controller';
import { TestResultService } from './test-result.service';

/**
 * TestResult read module (plan §4 Phase3).
 * Exposes GET /test-results for CUSTOMER role (read-only, seed data).
 *
 * The UploadPipeline adapter boundary (upload-pipeline.interface.ts) is a
 * design-only interface in this phase — no upload endpoint is wired here.
 * PrismaService is injected via the @Global PrismaModule.
 */
@Module({
  controllers: [TestResultController],
  providers: [TestResultService],
})
export class TestResultModule {}
