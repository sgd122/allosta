'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Callout,
  Card,
  Flex,
  Heading,
  Spinner,
  Text,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import {
  useAnalytics,
  OutcomeDonut,
  ProductInterestBars,
  MetricConversionTable,
} from '@/entities/analytics';
import { toFriendlyMessage } from '@/shared/api';
import { Eyebrow, PageHeader, StatNumber, Meter } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';
import { OpsRateCard } from './OpsRateCard';
import { ChallengeConversionCard } from './ChallengeConversionCard';
import { BookingFunnelCard } from './BookingFunnelCard';
import { BriefProductivityCard } from './BriefProductivityCard';
import { SummarySweepButton } from '@/features/trigger-summary-sweep';
import { RecordsList } from './RecordsList';
import { DrilldownDialog } from './DrilldownDialog';

export default function AdminDashboardPage() {
  const [drilldownRecordId, setDrilldownRecordId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useAnalytics();

  return (
    <Box>
      <PageHeader
        eyebrow="애널리틱스"
        title="상담 전환 대시보드"
        description="상담 결과와 지표가 실제 구매로 이어지는 흐름을 한눈에 살펴보세요."
        action={<SummarySweepButton />}
      />

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}
      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{toFriendlyMessage(error, '분석 데이터를 불러오지 못했습니다.')}</Callout.Text>
        </Callout.Root>
      )}

      {data && (
        <Flex direction="column" gap="4">
          <Card size="4" className="rise border border-teal-4 bg-teal-2">
            <Flex align="start" justify="between" wrap="wrap" gap="4">
              <Box>
                <Text size="2" color="teal" weight="medium" className="mb-1.5 block">전체 전환율</Text>
                <StatNumber tone="teal" size="xl">{formatPercent(data.conversionRate)}</StatNumber>
                <Text size="2" color="gray" mt="2" as="p">
                  총 <Text weight="bold" color="gray">{data.totalRecords}</Text>건 중{' '}
                  <Text weight="bold" color="teal">{data.outcomeDistribution.PURCHASED}</Text>건이 구매로 전환되었습니다.
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

          <Flex gap="4" wrap="wrap">
            <OpsRateCard
              label="노쇼율"
              sublabel="완료 대비 노쇼"
              value={data.noShowRate}
              tone="red"
              delay="60ms"
            />
            <OpsRateCard
              label="슬롯 활용률"
              sublabel="과거 개방 슬롯 중 예약 있는 비율"
              value={data.slotUtilization}
              tone="teal"
              delay="120ms"
            />
            <OpsRateCard
              label="대기 전환율"
              sublabel="대기 → 예약 전환 (만료 대비)"
              value={data.waitlistConversionRate}
              tone="amber"
              delay="180ms"
            />
            <ChallengeConversionCard
              enrollments={data.challengeEnrollments}
              conversionRate={data.challengeConversionRate}
              delay="240ms"
            />
          </Flex>

          <BookingFunnelCard funnel={data.funnel} />

          <BriefProductivityCard
            briefOpenRate={data.briefOpenRate}
            aiSummaryCount={data.aiSummaryCount}
            aiSummaryUpgradedRatio={data.aiSummaryUpgradedRatio}
          />

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

          <RecordsList onDrilldown={setDrilldownRecordId} />
        </Flex>
      )}

      {drilldownRecordId !== null && (
        <DrilldownDialog
          recordId={drilldownRecordId}
          onClose={() => setDrilldownRecordId(null)}
        />
      )}
    </Box>
  );
}
