import { SubjectType } from '@prisma/client';

/**
 * Reference to an uploaded file as received at the HTTP boundary.
 * Fields mirror what a multipart upload or storage-service callback would
 * provide; the concrete shape is intentionally minimal so adapters may
 * augment it without breaking the interface contract.
 */
export interface UploadedFileRef {
  /** Original filename provided by the client. */
  readonly originalName: string;
  /** MIME type declared by the client or detected by the server. */
  readonly mimeType: string;
  /** Byte size of the raw file. */
  readonly sizeBytes: number;
  /** Opaque storage key or temporary file path for the adapter to resolve. */
  readonly storageKey: string;
}

/**
 * Parsed, normalised test-result data that the pipeline emits before
 * persistence.  `metrics` is intentionally typed as `Record<string, unknown>`
 * — the concrete schema varies by `serviceType` and is validated by each
 * adapter implementation.
 */
export interface TestResultDraft {
  readonly subjectType: SubjectType;
  readonly subjectId: string;
  readonly serviceType: string;
  readonly metrics: Record<string, unknown>;
}

/**
 * **Design-boundary interface — no implementation exists in this codebase.**
 *
 * ## Purpose
 * `UploadPipeline` defines the seam between the read-only demo data layer and
 * any future real-world upload / parse adapter (PDF extraction, OCR, lab-feed
 * webhook, etc.).  Following plan §2.1 principle 4 ("adapter boundary"),
 * keeping this as a pure interface means:
 *
 * 1. The demo uses seed data directly (no file upload needed for the demo).
 * 2. A real adapter (e.g. `PdfUploadPipeline`) can be wired via NestJS DI
 *    by providing `{ provide: UPLOAD_PIPELINE_TOKEN, useClass: PdfUploadPipeline }`
 *    in a feature module — zero changes to the controller or service.
 * 3. Tests can inject a lightweight stub that satisfies this contract without
 *    touching any real file-system or OCR service.
 *
 * ## Non-goal
 * Actual PDF parsing, OCR, lab-feed ingestion, or cloud-storage integration
 * are **explicitly out of scope** for the current phase.  The `TestResultService`
 * reads only seeded rows via Prisma and does not call this interface at all
 * until a concrete adapter is registered.
 *
 * ## How to implement a real adapter
 * ```ts
 * // pdf-upload-pipeline.adapter.ts
 * @Injectable()
 * export class PdfUploadPipeline implements UploadPipeline {
 *   async ingest(file: UploadedFileRef): Promise<TestResultDraft> {
 *     // 1. Retrieve bytes from file.storageKey
 *     // 2. Run OCR / PDF parse
 *     // 3. Map extracted fields → TestResultDraft
 *   }
 * }
 *
 * // test-result.module.ts (when ready)
 * { provide: UPLOAD_PIPELINE_TOKEN, useClass: PdfUploadPipeline }
 * ```
 */
export interface UploadPipeline {
  /**
   * Ingests a raw uploaded file, parses / extracts its test-result data, and
   * returns a normalised draft ready for persistence.
   *
   * @param file - Reference to the uploaded file in transient storage.
   * @returns A promise that resolves to the parsed {@link TestResultDraft}.
   * @throws An error if the file cannot be read, parsed, or does not conform
   *   to an expected test-result format.
   */
  ingest(file: UploadedFileRef): Promise<TestResultDraft>;
}

/**
 * NestJS injection token for `UploadPipeline`.
 * Register a concrete class against this token when a real adapter is ready.
 */
export const UPLOAD_PIPELINE_TOKEN = Symbol('UPLOAD_PIPELINE_TOKEN');
