'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Separator,
  Text,
} from '@radix-ui/themes';
import { ChatBubbleIcon } from '@radix-ui/react-icons';
import { toMetricList, ResultSection, type TestReport } from '@/entities/test-result';
import { QaPanel } from '@/features/ask-test-result-ai';
import { formatDay } from '@/shared/lib/format';

// One visit-level 검사 결과서: a person + date header, then a section per test.
export function ReportCard({ report, index }: { report: TestReport; index: number }) {
  const [isAskOpen, setIsAskOpen] = useState(false);

  // The Q&A surface is scoped to a single TestResult; use the report's
  // representative (first) result. Reports always have at least one result.
  const qaTestResultId = report.results[0]?.id ?? null;

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

      {qaTestResultId && (
        <>
          <Separator size="4" my="4" />
          {isAskOpen ? (
            <QaPanel testResultId={qaTestResultId} />
          ) : (
            <Button
              variant="soft"
              color="teal"
              onClick={() => setIsAskOpen(true)}
              data-testid="qa-open"
            >
              <ChatBubbleIcon />
              이 결과에 대해 AI에게 질문하기
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
