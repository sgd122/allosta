import { Box, Card, Flex, Text } from '@radix-ui/themes';
import type { Analytics } from '@/entities/analytics';
import { Eyebrow, Meter, StatNumber } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';

type Props = {
  briefOpenRate: Analytics['briefOpenRate'];
};

/**
 * Consultation-prep productivity (AC-P7): the brief-open rate is the single
 * headline figure — the share of upcoming consultations the counselor actually
 * prepared for by opening the pre-consultation brief. Reuses the shared
 * StatNumber/Meter/Eyebrow primitives so it sits in the same visual language as
 * the other dashboard KPI cards.
 */
export function BriefProductivityCard({ briefOpenRate }: Props) {
  return (
    <Card size="3" className="rise" style={{ animationDelay: '300ms' }}>
      <Flex direction={{ initial: 'column', sm: 'row' }} align="start" gap="5">
        <Box className="sm:max-w-[260px]">
          <Eyebrow className="mb-1 tracking-[0.12em]">상담 준비</Eyebrow>
          <Text size="2" color="gray" as="p">
            상담사가 사전 브리핑을 얼마나 챙겨 보는지 — 준비된 상담의 비율입니다.
          </Text>
        </Box>

        <Box className="min-w-[180px] flex-1">
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            브리핑 열람률
          </Text>
          <StatNumber tone="violet" size="xl">{formatPercent(briefOpenRate)}</StatNumber>
          <Meter
            className="mt-3"
            tone="violet"
            percent={briefOpenRate * 100}
          />
          <Text size="1" color="gray" mt="2" as="p">
            확정·완료·노쇼 예약 중 상담사가 브리핑을 연 비율
          </Text>
        </Box>
      </Flex>
    </Card>
  );
}
