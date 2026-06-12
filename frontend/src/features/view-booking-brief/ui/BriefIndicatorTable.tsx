import { Badge, Flex, Table, Text } from '@radix-ui/themes';
import { formatMetricKey, formatServiceType, metricStatusColor } from '@/entities/test-result';
import { abnormalFirst, isAbnormalStatus, type BriefIndicator } from '@/entities/consultation-brief';

/**
 * Renders the brief's interpreted indicators, abnormal (주의/위험) lifted to the
 * top and tinted by 판정 — so the counselor sees what's out of range first. The
 * 검사 결과서 column layout intentionally mirrors entities/test-result's
 * ResultSection (항목 · 수치 · 참조범위 · 판정) for a consistent reading model.
 */
export function BriefIndicatorTable({ indicators }: { indicators: BriefIndicator[] }) {
  if (indicators.length === 0) {
    return <Text size="2" color="gray">표시할 검사 지표가 없습니다.</Text>;
  }

  const ordered = abnormalFirst(indicators);

  return (
    <Table.Root variant="surface" size="1">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>항목</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">수치</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">참조범위</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">판정</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {ordered.map((indicator) => {
          const abnormal = isAbnormalStatus(indicator.status);
          return (
            <Table.Row
              key={`${indicator.testResultId}-${indicator.metricKey}`}
              className={abnormal ? 'bg-amber-2' : undefined}
            >
              <Table.RowHeaderCell>
                <Flex direction="column" gap="1">
                  <Text size="2" weight={abnormal ? 'medium' : 'regular'}>
                    {indicator.label ?? formatMetricKey(indicator.metricKey)}
                  </Text>
                  <Text size="1" color="gray">{formatServiceType(indicator.serviceType)}</Text>
                </Flex>
              </Table.RowHeaderCell>
              <Table.Cell align="right">
                <Text weight="medium">{indicator.value ?? '—'}</Text>
                {indicator.unit && (
                  <Text size="1" color="gray" ml="1">{indicator.unit}</Text>
                )}
              </Table.Cell>
              <Table.Cell align="right">
                <Text size="1" color="gray" className="font-mono">
                  {indicator.referenceRange ?? '—'}
                </Text>
              </Table.Cell>
              <Table.Cell align="right">
                {indicator.status ? (
                  <Badge color={metricStatusColor(indicator.status)} variant={abnormal ? 'solid' : 'soft'} size="1">
                    {indicator.status}
                  </Badge>
                ) : (
                  <Text size="1" color="gray">—</Text>
                )}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}
