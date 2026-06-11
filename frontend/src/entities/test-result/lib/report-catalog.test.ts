import { describe, expect, it } from 'vitest';
import { createReportCatalog } from './report-catalog';
import type { TestResult } from '../types';

function result(over: Partial<TestResult> & { id: string }): TestResult {
  return {
    subjectType: 'CUSTOMER',
    subjectId: 'self',
    serviceType: 'METABOLIC_6',
    metrics: [],
    createdAt: '2026-06-10T09:00:00.000Z',
    ...over,
  };
}

describe('createReportCatalog', () => {
  it('returns own reports, family reports, and an index by result id from one interface', () => {
    const catalog = createReportCatalog(
      [
        result({ id: 'mine-a', subjectId: 'self' }),
        result({ id: 'family-a', subjectId: 'fam-1' }),
      ],
      [{ id: 'fam-1', name: '이가족' }],
    );

    expect(catalog.ownReports.map((r) => r.subjectName)).toEqual(['본인']);
    expect(catalog.familyReports.map((r) => r.subjectName)).toEqual(['이가족']);
    expect(catalog.reportByResultId.get('mine-a')?.isFamily).toBe(false);
    expect(catalog.reportByResultId.get('family-a')?.isFamily).toBe(true);
  });
});
