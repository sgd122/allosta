import { describe, expect, it } from 'vitest';

import { formatMetricKey, metricStatusColor, toMetricList } from './metrics';
import type { TestMetric } from '../types';

describe('toMetricList', () => {
  it('carries the extended TestMetric shape (referenceRange + status) without stripping', () => {
    const raw = [
      {
        metricKey: 'glucose',
        label: '공복혈당',
        value: 102,
        unit: 'mg/dL',
        referenceRange: '70–99',
        status: '주의',
      },
    ];

    const result = toMetricList(raw);

    expect(result).toHaveLength(1);
    const [metric] = result;
    expect(metric.metricKey).toBe('glucose');
    expect(metric.label).toBe('공복혈당');
    expect(metric.value).toBe(102);
    expect(metric.unit).toBe('mg/dL');
    expect(metric.referenceRange).toBe('70–99');
    expect(metric.status).toBe('주의');
  });

  it('handles the minimal {metricKey, value, unit} shape without throwing', () => {
    const raw = [{ metricKey: 'vitaminD', value: 18.5, unit: 'ng/mL' }];

    const result = toMetricList(raw);

    expect(result).toHaveLength(1);
    expect(result[0].metricKey).toBe('vitaminD');
    expect(result[0].value).toBe(18.5);
  });

  it('drops flat/legacy entries lacking a string metricKey instead of throwing', () => {
    const raw: unknown = [
      { glucose: 102 },
      { metricKey: 42, value: 1 },
      null,
      'not-an-object',
      { metricKey: 'cholesterol', value: 180, unit: 'mg/dL' },
    ];

    const result = toMetricList(raw);

    expect(result).toHaveLength(1);
    expect(result[0].metricKey).toBe('cholesterol');
  });

  it('returns an empty array for non-array input', () => {
    expect(toMetricList(undefined)).toEqual([]);
    expect(toMetricList(null)).toEqual([]);
    expect(toMetricList({ metricKey: 'glucose' })).toEqual([]);
  });
});

describe('metricStatusColor', () => {
  it('maps each known status to a distinct color', () => {
    const colors = [
      metricStatusColor('정상'),
      metricStatusColor('주의'),
      metricStatusColor('위험'),
    ];

    expect(colors).toEqual(['teal', 'amber', 'red']);
    expect(new Set(colors).size).toBe(3);
  });

  it('falls back to gray for undefined or unknown status', () => {
    expect(metricStatusColor(undefined)).toBe('gray');
    expect(metricStatusColor('나쁨')).toBe('gray');
    expect(metricStatusColor('')).toBe('gray');
  });
});

describe('formatMetricKey', () => {
  it('maps a known metric key to its Korean label', () => {
    expect(formatMetricKey('glucose')).toBe('공복혈당');
    expect(formatMetricKey('hba1c')).toBe('당화혈색소');
    expect(formatMetricKey('wheatIgG')).toBe('밀 IgG');
  });

  it('falls back to the raw key for an unknown metric', () => {
    expect(formatMetricKey('unknownMetric')).toBe('unknownMetric');
  });
});

const _typeCheck: TestMetric = {
  metricKey: 'glucose',
  label: '공복혈당',
  value: 102,
  unit: 'mg/dL',
  referenceRange: '70–99',
  status: '주의',
};
void _typeCheck;
