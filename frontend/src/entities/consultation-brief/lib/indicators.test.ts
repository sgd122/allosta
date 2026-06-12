import { describe, expect, it } from 'vitest';
import { abnormalFirst, countAbnormalIndicators, isAbnormalStatus } from './indicators';
import type { BriefIndicator } from '../types';

function indicator(over: Partial<BriefIndicator> & { metricKey: string }): BriefIndicator {
  return {
    testResultId: 'tr-1',
    serviceType: 'METABOLIC_6',
    label: null,
    value: 1,
    unit: null,
    referenceRange: null,
    status: null,
    ...over,
  };
}

describe('isAbnormalStatus', () => {
  it('treats 주의 and 위험 as abnormal', () => {
    expect(isAbnormalStatus('주의')).toBe(true);
    expect(isAbnormalStatus('위험')).toBe(true);
  });

  it('treats 정상, null, and unknown strings as normal', () => {
    expect(isAbnormalStatus('정상')).toBe(false);
    expect(isAbnormalStatus(null)).toBe(false);
    expect(isAbnormalStatus('나쁨')).toBe(false);
  });
});

describe('countAbnormalIndicators', () => {
  it('counts only out-of-range indicators', () => {
    const rows = [
      indicator({ metricKey: 'a', status: '위험' }),
      indicator({ metricKey: 'b', status: '정상' }),
      indicator({ metricKey: 'c', status: '주의' }),
      indicator({ metricKey: 'd', status: null }),
    ];
    expect(countAbnormalIndicators(rows)).toBe(2);
  });

  it('returns zero for an empty list', () => {
    expect(countAbnormalIndicators([])).toBe(0);
  });
});

describe('abnormalFirst', () => {
  it('lifts abnormal indicators ahead of normal ones without mutating the input', () => {
    const rows = [
      indicator({ metricKey: 'glucose', status: '정상' }),
      indicator({ metricKey: 'ldl', status: '위험' }),
      indicator({ metricKey: 'hdl', status: null }),
      indicator({ metricKey: 'hba1c', status: '주의' }),
    ];
    const snapshot = rows.map((r) => r.metricKey);

    const sorted = abnormalFirst(rows);

    expect(sorted.map((r) => r.metricKey)).toEqual(['ldl', 'hba1c', 'glucose', 'hdl']);
    // Preserves backend metricKey asc order within each group, no mutation.
    expect(rows.map((r) => r.metricKey)).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(abnormalFirst([])).toEqual([]);
  });
});
