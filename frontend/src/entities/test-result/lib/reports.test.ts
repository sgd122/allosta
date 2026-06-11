import { describe, expect, it } from 'vitest';

import { groupResultsIntoReports, indexReportsByResultId, representativeResultId } from './reports';
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

describe('groupResultsIntoReports', () => {
  it("groups one subject's same-day results into a single 결과서", () => {
    const results = [
      result({ id: 'r1', serviceType: 'METABOLIC_6' }),
      result({ id: 'r2', serviceType: 'GUT_MICROBIOME', createdAt: '2026-06-10T10:00:00.000Z' }),
      result({ id: 'r3', serviceType: 'FOOD_INTOLERANCE', createdAt: '2026-06-10T11:00:00.000Z' }),
    ];

    const reports = groupResultsIntoReports(results, new Map());

    expect(reports).toHaveLength(1);
    expect(reports[0].results).toHaveLength(3);
    expect(reports[0].subjectName).toBe('본인');
    expect(reports[0].isFamily).toBe(false);
  });

  it('separates own vs linked family subjects via the name map', () => {
    const results = [
      result({ id: 'mine', subjectId: 'self' }),
      result({ id: 'theirs', subjectId: 'fam-1' }),
    ];
    const names = new Map([['fam-1', '이가족']]);

    const reports = groupResultsIntoReports(results, names);

    const own = reports.find((r) => !r.isFamily);
    const family = reports.find((r) => r.isFamily);
    expect(own?.subjectName).toBe('본인');
    expect(family?.subjectName).toBe('이가족');
    expect(family?.subjectId).toBe('fam-1');
  });

  it('splits the same subject across different days into separate reports', () => {
    const results = [
      result({ id: 'old', createdAt: '2026-05-01T09:00:00.000Z' }),
      result({ id: 'new', createdAt: '2026-06-10T09:00:00.000Z' }),
    ];

    const reports = groupResultsIntoReports(results, new Map());

    expect(reports).toHaveLength(2);
    expect(reports[0].results[0].id).toBe('new');
  });

  it('orders results newest-first within a report', () => {
    const results = [
      result({ id: 'a', createdAt: '2026-06-10T08:00:00.000Z' }),
      result({ id: 'c', createdAt: '2026-06-10T12:00:00.000Z' }),
      result({ id: 'b', createdAt: '2026-06-10T10:00:00.000Z' }),
    ];

    const [report] = groupResultsIntoReports(results, new Map());

    expect(report.results.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(report.createdAt).toBe('2026-06-10T12:00:00.000Z');
  });

  it('does not mutate the input array', () => {
    const results = [
      result({ id: 'a', createdAt: '2026-06-10T08:00:00.000Z' }),
      result({ id: 'b', createdAt: '2026-06-10T12:00:00.000Z' }),
    ];
    const snapshot = results.map((r) => r.id);

    groupResultsIntoReports(results, new Map());

    expect(results.map((r) => r.id)).toEqual(snapshot);
  });

  it('returns an empty array for no results', () => {
    expect(groupResultsIntoReports([], new Map())).toEqual([]);
  });
});

describe('indexReportsByResultId', () => {
  it('maps every result id to the report it belongs to', () => {
    const reports = groupResultsIntoReports(
      [
        result({ id: 'a', subjectId: 'self', serviceType: 'METABOLIC_6' }),
        result({ id: 'b', subjectId: 'self', serviceType: 'GUT_MICROBIOME' }),
        result({ id: 'c', subjectId: 'fam-1' }),
      ],
      new Map([['fam-1', '이가족']]),
    );

    const index = indexReportsByResultId(reports);

    expect(index.get('a')).toBe(index.get('b'));
    expect(index.get('a')?.results).toHaveLength(2);
    expect(index.get('c')?.isFamily).toBe(true);
    expect(index.get('missing')).toBeUndefined();
  });
});

describe('representativeResultId', () => {
  it('returns the latest result id as the booking anchor', () => {
    const [report] = groupResultsIntoReports(
      [
        result({ id: 'older', createdAt: '2026-06-10T08:00:00.000Z' }),
        result({ id: 'latest', createdAt: '2026-06-10T12:00:00.000Z' }),
      ],
      new Map(),
    );

    expect(representativeResultId(report)).toBe('latest');
  });
});
