import type { TestResult } from '../types';
import { groupResultsIntoReports, indexReportsByResultId, type TestReport } from './reports';

export interface SubjectName {
  id: string;
  name: string;
}

export interface ReportCatalog {
  reports: TestReport[];
  ownReports: TestReport[];
  familyReports: TestReport[];
  reportByResultId: Map<string, TestReport>;
}

/**
 * Subject-aware report catalog used by booking, bookings, and results views.
 * It keeps the family-link subject-name mapping local to one module instead of
 * requiring every caller to rebuild the same map before grouping reports.
 */
export function createReportCatalog(
  results: readonly TestResult[],
  subjectNames: readonly SubjectName[],
): ReportCatalog {
  const nameBySubjectId = new Map(subjectNames.map((subject) => [subject.id, subject.name]));
  const reports = groupResultsIntoReports(results, nameBySubjectId);
  return {
    reports,
    ownReports: reports.filter((report) => !report.isFamily),
    familyReports: reports.filter((report) => report.isFamily),
    reportByResultId: indexReportsByResultId(reports),
  };
}
