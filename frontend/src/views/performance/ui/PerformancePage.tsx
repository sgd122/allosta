'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Callout,
  Card,
  Flex,
  Heading,
  SegmentedControl,
  Spinner,
  Text,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { toFriendlyMessage } from '@/shared/api';
import { formatPercent } from '@/shared/lib/format';
import {
  useScopedAnalytics,
  OutcomeDonut,
  ProductInterestBars,
  MetricConversionTable,
  type AnalyticsScope,
} from '@/entities/analytics';
import { Eyebrow, StatNumber, Meter } from '@/shared/ui';

export default function CounselorDashboardPage() {
  const [scope, setScope] = useState<AnalyticsScope>('own');

  const { data, isLoading, isError, error } = useScopedAnalytics(scope);

  return (
    <Box>
      <Box mb="6" className="rise">
        <Eyebrow>상담사 콘솔</Eyebrow>
        <Heading
          as="h1"
          mt="2"
          mb="4"
          className="font-serif font-medium text-[clamp(1.75rem,1.2rem+1.5vw,2.25rem)]"
        >
          상담 성과 대시보드
        </Heading>

        <SegmentedControl.Root
          value={scope}
          onValueChange={(val) => setScope(val as AnalyticsScope)}
          aria-label="데이터 범위"
          mb="3"
        >
          <SegmentedControl.Item value="own">내 실적</SegmentedControl.Item>
          <SegmentedControl.Item value="all">전체 실적</SegmentedControl.Item>
        </SegmentedControl.Root>

        <Text size="2" color="gray" as="p">
          {scope === 'own' ? '내 상담 기록 기준 전환 성과' : '전체 상담사 기준 집계 성과'}
        </Text>
      </Box>

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}

      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{toFriendlyMessage(error, '데이터를 불러오지 못했습니다.')}</Callout.Text>
        </Callout.Root>
      )}

      {data && (
        <Flex direction="column" gap="4">
          <Card size="4" className="rise border border-teal-4 bg-teal-2">
            <Flex align="start" justify="between" wrap="wrap" gap="4">
              <Box>
                <Text size="2" color="teal" weight="medium" className="mb-1.5 block">
                  {scope === 'own' ? '내 전환율' : '전체 전환율'}
                </Text>
                <StatNumber tone="teal" size="xl">
                  {formatPercent(data.conversionRate)}
                </StatNumber>
                <Text size="2" color="gray" mt="2" as="p">
                  총 <Text weight="bold" color="gray">{data.totalRecords}</Text>건 중{' '}
                  <Text weight="bold" color="teal">{data.outcomeDistribution.PURCHASED}</Text>건 구매 전환
                </Text>
              </Box>
              <Flex gap="2" wrap="wrap">
                <Badge color="gray" size="2">결과 설명 {data.outcomeDistribution.EXPLAINED}</Badge>
                <Badge color="amber" size="2">영양제 안내 {data.outcomeDistribution.GUIDED}</Badge>
                <Badge color="teal" size="2">구매 {data.outcomeDistribution.PURCHASED}</Badge>
              </Flex>
            </Flex>
            <Meter
              className="mt-4"
              tone="teal"
              trackClassName="bg-teal-4"
              percent={data.conversionRate * 100}
            />
          </Card>

          <Flex gap="4" direction={{ initial: 'column', sm: 'row' }}>
            <Card size="3" className="rise flex-1" style={{ animationDelay: '60ms' }}>
              <Heading size="3" mb="4" className="font-serif font-medium">
                상담 결과 분포
              </Heading>
              <OutcomeDonut distribution={data.outcomeDistribution} total={data.totalRecords} />
            </Card>

            <Card size="3" className="rise flex-[2]" style={{ animationDelay: '120ms' }}>
              <Flex align="start" justify="between" mb="4" wrap="wrap" gap="2">
                <Heading size="3" className="font-serif font-medium">
                  관심 상품 순위
                </Heading>
                <Text size="1" color="gray">상담에서 언급된 상품 빈도</Text>
              </Flex>
              <ProductInterestBars items={data.productInterest} />
            </Card>
          </Flex>

          <Card size="3" className="rise" style={{ animationDelay: '180ms' }}>
            <Flex align="start" justify="between" mb="4" wrap="wrap" gap="2">
              <Box>
                <Eyebrow className="mb-1 tracking-[0.12em]">차별화 지표</Eyebrow>
                <Heading size="4" className="font-serif font-medium">
                  지표별 구매 전환
                </Heading>
              </Box>
              <Text size="1" color="gray">상담에서 다룬 검사 지표가 실제 구매로 이어진 비율</Text>
            </Flex>
            <MetricConversionTable rows={data.metricConversion} />
          </Card>
        </Flex>
      )}
    </Box>
  );
}
