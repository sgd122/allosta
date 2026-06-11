import { Badge, Box, Card, Flex, Heading, Separator, Text } from '@radix-ui/themes';
import { toMetricList, ResultSection, type TestReport } from '@/entities/test-result';
import { formatDay } from '@/shared/lib/format';

// One visit-level 검사 결과서: a person + date header, then a section per test.
export function ReportCard({ report, index }: { report: TestReport; index: number }) {
  return (
    <Card size="3" className="rise" style={{ animationDelay: `${index * 50}ms` }}>
      <Flex align="center" justify="between" gap="4" mb="4" wrap="wrap">
        <Flex align="center" gap="3">
          <Badge
            color={report.isFamily ? 'amber' : 'teal'}
            variant="soft"
            radius="full"
            size="2"
          >
            {report.subjectName}
          </Badge>
          <Heading as="h2" size="3" className="font-medium">
            검사 결과서
          </Heading>
          <Text size="1" color="gray">
            검사 {report.results.length}종
          </Text>
        </Flex>
        <Text size="1" color="gray" className="font-mono">
          {formatDay(report.createdAt)}
        </Text>
      </Flex>

      <Flex direction="column" gap="4">
        {report.results.map((result, i) => (
          <Box key={result.id}>
            {i > 0 && <Separator size="4" mb="4" />}
            <ResultSection serviceType={result.serviceType} metrics={toMetricList(result.metrics)} />
          </Box>
        ))}
      </Flex>
    </Card>
  );
}
