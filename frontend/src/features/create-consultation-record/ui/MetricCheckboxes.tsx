import { Box, Flex, Separator, Text } from '@radix-ui/themes';
import { ResultSection } from '@/entities/test-result';
import { formatDay } from '@/shared/lib/format';
import { encodeMetric } from '../model/draft';
import type { MetricCheckboxesProps } from '../types';

/**
 * Renders the subject's results in the SAME 검사 결과서 layout the customer sees
 * (friendly serviceType headings + 항목/수치/참조범위/판정 tables), with a leading
 * checkbox column so the counselor can link discussed metrics to the record.
 */
export function MetricCheckboxes({ testResults, selected, onToggle }: MetricCheckboxesProps) {
  if (testResults.length === 0) {
    return (
      <Box className="rounded-3 border border-dashed border-gray-5 bg-gray-2 p-4 text-center">
        <Text size="2" color="gray">이 고객의 검사 결과가 없습니다.</Text>
      </Box>
    );
  }

  const latest = testResults.reduce(
    (max, r) => (r.createdAt > max ? r.createdAt : max),
    testResults[0].createdAt,
  );

  return (
    <Box className="rounded-3 border border-gray-4 bg-panel p-4">
      <Flex align="center" justify="between" gap="3" mb="4" wrap="wrap">
        <Flex align="center" gap="2">
          <Text size="2" weight="bold">검사 결과서</Text>
          <Text size="1" color="gray">검사 {testResults.length}종</Text>
        </Flex>
        <Text size="1" color="gray" className="font-mono">
          {formatDay(latest)}
        </Text>
      </Flex>

      <Flex direction="column" gap="4">
        {testResults.map((result, i) => (
          <Box key={result.id}>
            {i > 0 && <Separator size="4" mb="4" />}
            <ResultSection
              serviceType={result.serviceType}
              metrics={result.metrics}
              selection={{
                isSelected: (metricKey) => selected.has(encodeMetric({ testResultId: result.id, metricKey })),
                onToggle: (metricKey) => onToggle(encodeMetric({ testResultId: result.id, metricKey })),
              }}
            />
          </Box>
        ))}
      </Flex>
    </Box>
  );
}
