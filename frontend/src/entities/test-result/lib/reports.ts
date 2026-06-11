/**
 * Groups individual TestResult rows into visit-level "검사 결과서" (reports).
 */

import type { TestResult } from '../types';
import { formatDay } from '@/shared/lib/format';

export interface TestReport {
  key: string;
  subjectId: string;
  subjectName: string;
  isFamily: boolean;
  createdAt: string;
  results: TestResult[];
}

export function groupResultsIntoReports(
  results: readonly TestResult[],
  nameBySubjectId: ReadonlyMap<string, string>,
): TestReport[] {
  const groups = new Map<string, TestResult[]>();

  for (const result of results) {
    const key = `${result.subjectId}::${formatDay(result.createdAt)}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(result);
    } else {
      groups.set(key, [result]);
    }
  }

  const reports: TestReport[] = [];
  for (const [key, bucket] of Array.from(groups.entries())) {
    const sorted = [...bucket].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const { subjectId } = sorted[0];
    reports.push({
      key,
      subjectId,
      subjectName: nameBySubjectId.get(subjectId) ?? '본인',
      isFamily: nameBySubjectId.has(subjectId),
      createdAt: sorted[0].createdAt,
      results: sorted,
    });
  }

  return reports.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.subjectName.localeCompare(b.subjectName),
  );
}

export function representativeResultId(report: TestReport): string {
  return report.results[0].id;
}

export function indexReportsByResultId(reports: readonly TestReport[]): Map<string, TestReport> {
  const index = new Map<string, TestReport>();
  for (const report of reports) {
    for (const result of report.results) {
      index.set(result.id, report);
    }
  }
  return index;
}
