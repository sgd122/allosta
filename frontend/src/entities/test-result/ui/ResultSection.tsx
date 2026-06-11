'use client';

import { Badge, Box, Heading, Table, Text } from '@radix-ui/themes';
import { CheckIcon } from '@radix-ui/react-icons';
import { formatServiceType, metricStatusColor } from '../lib/metrics';
import type { ResultSectionProps } from '../types';

export type { MetricSelection } from '../types';

export function ResultSection({ serviceType, metrics, selection }: ResultSectionProps) {
  const selectable = selection != null;

  return (
    <Box>
      <Heading as="h3" size="2" mb="2" className="font-medium">
        {formatServiceType(serviceType)}
      </Heading>

      {metrics.length === 0 ? (
        <Text size="2" color="gray">측정 항목이 없습니다.</Text>
      ) : (
        <Table.Root variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              {selectable && <Table.ColumnHeaderCell aria-label="연계 선택" />}
              <Table.ColumnHeaderCell>항목</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">수치</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">참조범위</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">판정</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {metrics.map((metric) => {
              const checked = selection?.isSelected(metric.metricKey) ?? false;
              return (
                <Table.Row
                  key={metric.metricKey}
                  onClick={selectable ? () => selection!.onToggle(metric.metricKey) : undefined}
                  className={selectable ? `cursor-pointer ${checked ? 'bg-teal-3' : ''}` : undefined}
                >
                  {selectable && (
                    <Table.Cell>
                      <Box
                        aria-hidden
                        className={`flex h-[18px] w-[18px] items-center justify-center rounded-1 border-[1.5px] border-solid text-white ${
                          checked ? 'border-teal-9 bg-teal-9' : 'border-gray-7'
                        }`}
                      >
                        {checked && <CheckIcon width="13" height="13" />}
                      </Box>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => selection!.onToggle(metric.metricKey)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${metric.label ?? metric.metricKey} 연계`}
                        className="absolute h-0 w-0 opacity-0"
                      />
                    </Table.Cell>
                  )}
                  <Table.RowHeaderCell className="font-mono">
                    {metric.label ?? metric.metricKey}
                  </Table.RowHeaderCell>
                  <Table.Cell align="right">
                    <Text weight="medium">{metric.value ?? '—'}</Text>
                    {metric.unit && (
                      <Text size="1" color="gray" ml="1">{metric.unit}</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell align="right">
                    <Text size="1" color="gray" className="font-mono">
                      {metric.referenceRange ?? '—'}
                    </Text>
                  </Table.Cell>
                  <Table.Cell align="right">
                    {metric.status ? (
                      <Badge color={metricStatusColor(metric.status)} variant="soft" size="1">
                        {metric.status}
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
      )}
    </Box>
  );
}
