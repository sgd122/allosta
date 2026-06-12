import { Badge, Box, Card, Flex, Text } from '@radix-ui/themes';
import { FileTextIcon } from '@radix-ui/react-icons';
import type { Analytics } from '@/entities/analytics';
import { Eyebrow, Meter, StatNumber } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';

type Props = {
  briefOpenRate: Analytics['briefOpenRate'];
  aiSummaryCount: Analytics['aiSummaryCount'];
  aiSummaryUpgradedRatio: Analytics['aiSummaryUpgradedRatio'];
};

/**
 * Consultation-prep productivity (AC-P7): brief-open rate as the headline
 * figure, with AI-summary volume and the UPGRADED (local-LLM) ratio as the
 * secondary read. Reuses the shared StatNumber/Meter/Eyebrow primitives so it
 * sits in the same visual language as the other dashboard KPI cards.
 */
export function BriefProductivityCard({
  briefOpenRate,
  aiSummaryCount,
  aiSummaryUpgradedRatio,
}: Props) {
  return (
    <Card size="3" className="rise" style={{ animationDelay: '300ms' }}>
      <Flex align="start" justify="between" mb="3" wrap="wrap" gap="2">
        <Box>
          <Eyebrow className="mb-1 tracking-[0.12em]">상담 준비</Eyebrow>
          <Text size="2" color="gray">브리핑 열람률 · 사전 준비 생산성</Text>
        </Box>
        <Badge color="violet" variant="soft" size="1">
          <FileTextIcon /> AI 요약 {aiSummaryCount}건
        </Badge>
      </Flex>

      <Flex gap="6" wrap="wrap" align="end">
        <Box className="min-w-[160px] flex-1">
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            브리핑 열람률
          </Text>
          <StatNumber tone="violet" size="lg">{formatPercent(briefOpenRate)}</StatNumber>
          <Meter
            className="mt-3"
            tone="violet"
            percent={briefOpenRate * 100}
          />
          <Text size="1" color="gray" mt="2" as="p">
            확정·완료·노쇼 예약 중 상담사가 브리핑을 연 비율
          </Text>
        </Box>

        <Box className="min-w-[140px] flex-1">
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            로컬 LLM 업그레이드 비율
          </Text>
          <StatNumber tone="teal">{formatPercent(aiSummaryUpgradedRatio)}</StatNumber>
          <Text size="1" color="gray" mt="2" as="p">
            요약 {aiSummaryCount}건 중 gemma 업그레이드(UPGRADED) 비율
          </Text>
        </Box>
      </Flex>
    </Card>
  );
}
