'use client';

import { useMemo } from 'react';
import { Box, Callout, Flex, Spinner, Tabs } from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useFamilyMembers } from '@/entities/family-link';
import { useTestResults, createReportCatalog } from '@/entities/test-result';
import { toFriendlyMessage } from '@/shared/api';
import { PageHeader } from '@/shared/ui';
import { ReportList } from './ReportList';

export default function ResultsPage() {
  const resultsQuery = useTestResults();
  const familyQuery = useFamilyMembers();

  // Subject-aware catalog keeps grouping + family attribution in one module.
  const reportCatalog = useMemo(
    () => createReportCatalog(resultsQuery.data ?? [], familyQuery.data ?? []),
    [resultsQuery.data, familyQuery.data],
  );

  // Own results and linked-account results live in separate sub-tabs so the two
  // never blur together (the original single feed was confusing).
  const { ownReports, familyReports } = reportCatalog;

  const { isLoading, isError, error } = resultsQuery;

  return (
    <Box>
      <PageHeader
        eyebrow="검사 결과"
        title={<>내 <em className="italic text-teal-9">검사 결과</em></>}
        description="내 검사와 연동된 가족 계정의 결과를 탭으로 나누어 확인하세요."
      />

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}

      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{toFriendlyMessage(error, '검사 결과를 불러오지 못했습니다.')}</Callout.Text>
        </Callout.Root>
      )}

      {!isLoading && !isError && (
        <Tabs.Root defaultValue="mine">
          <Tabs.List>
            <Tabs.Trigger value="mine">
              내 검사{ownReports.length > 0 ? ` (${ownReports.length})` : ''}
            </Tabs.Trigger>
            <Tabs.Trigger value="family">
              연동 계정{familyReports.length > 0 ? ` (${familyReports.length})` : ''}
            </Tabs.Trigger>
          </Tabs.List>

          <Box pt="4">
            <Tabs.Content value="mine">
              <ReportList reports={ownReports} emptyText="아직 등록된 내 검사 결과가 없습니다." />
            </Tabs.Content>
            <Tabs.Content value="family">
              <ReportList
                reports={familyReports}
                emptyText="연동된 가족 계정의 검사 결과가 없습니다."
              />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      )}
    </Box>
  );
}
