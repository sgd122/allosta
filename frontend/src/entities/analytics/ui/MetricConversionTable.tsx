'use client';

import { Box, Flex, Table, Text } from '@radix-ui/themes';
import { formatPercent } from '@/shared/lib/format';
import { formatMetricKey } from '@/entities/test-result';
import type { MetricConversionTableProps } from '../types';

function band(rate: number): 'high' | 'mid' | 'low' {
  if (rate >= 0.5) return 'high';
  if (rate >= 0.25) return 'mid';
  return 'low';
}

export function MetricConversionTable({ rows }: MetricConversionTableProps) {
  if (rows.length === 0) {
    return (
      <Text size="2" color="gray">상담에서 연계된 지표가 아직 없습니다.</Text>
    );
  }

  const sorted = [...rows].sort((a, b) => b.conversionRate - a.conversionRate);
  const topRate = sorted[0]?.conversionRate ?? 0;

  return (
    <Table.Root variant="ghost" aria-label="지표별 구매 전환">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>지표</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">논의</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">구매</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell style={{ minWidth: 160 }}>전환율</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sorted.map((row) => {
          const tier = band(row.conversionRate);
          const relative = topRate > 0 ? (row.conversionRate / topRate) * 100 : 0;
          const barFillClass =
            tier === 'high' ? 'bg-purchased' :
            tier === 'mid'  ? 'bg-onhold' :
                              'bg-rejected';
          const textClass =
            tier === 'high' ? 'text-purchased' :
            tier === 'mid'  ? 'text-onhold' :
                              'text-rejected';

          return (
            <Table.Row key={row.metricKey}>
              <Table.Cell>
                <Text size="2">{formatMetricKey(row.metricKey)}</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text size="2" color="gray">{row.discussedCount}</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text size="2">{row.purchasedCount}</Text>
              </Table.Cell>
              <Table.Cell>
                <Flex align="center" gap="3">
                  <Box className="metric-bar-track" style={{ flex: 1 }}>
                    <Box
                      className={`metric-bar-fill ${barFillClass}`}
                      style={{ width: `${Math.max(4, relative)}%` }}
                    />
                  </Box>
                  <Text size="2" weight="bold" className={`${textClass} min-w-[40px] text-right`}>
                    {formatPercent(row.conversionRate, 0)}
                  </Text>
                </Flex>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}
