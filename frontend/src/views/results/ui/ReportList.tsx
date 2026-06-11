import { Card, Flex, Text } from '@radix-ui/themes';
import type { TestReport } from '@/entities/test-result';
import { ReportCard } from './ReportCard';

export function ReportList({ reports, emptyText }: { reports: TestReport[]; emptyText: string }) {
  if (reports.length === 0) {
    return (
      <Card size="4" className="text-center">
        <Text size="2" color="gray">{emptyText}</Text>
      </Card>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {reports.map((report, i) => (
        <ReportCard key={report.key} report={report} index={i} />
      ))}
    </Flex>
  );
}
