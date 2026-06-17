import { Badge, Box, Card, Flex, Heading, Text } from '@radix-ui/themes';
import { StatNumber } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';
import type { QaDeflection } from '@/entities/analytics';

type Props = {
  qaDeflection: QaDeflection;
};

/** Renders a rate, or a "no data" dash when the denominator was 0 (null). */
function rateText(rate: number | null): string {
  return rate === null ? '—' : formatPercent(rate);
}

/**
 * Customer AI Q&A deflection card (ADR 0018, AC10). GLOBAL scope — explicitly
 * labelled "전체 (상담사 무관)" so it isn't confused with the counselor-scoped
 * cards. Null-safe: shows "—" when there is no data yet.
 */
export function QaDeflectionCard({ qaDeflection }: Props) {
  const { helpfulnessRate, behavioralDeflectionRate, sessionCount } =
    qaDeflection;

  return (
    <Card size="3" className="rise" style={{ animationDelay: '200ms' }}>
      <Flex align="start" justify="between" mb="4" wrap="wrap" gap="2">
        <Box>
          <Heading size="3" className="font-serif font-medium">
            AI Q&A 이탈 효과
          </Heading>
          <Text size="1" color="gray">
            셀프서비스로 해소된 저부가 질문 (수치 해석)
          </Text>
        </Box>
        <Badge color="gray" variant="soft" size="2">
          전체 (상담사 무관)
        </Badge>
      </Flex>

      <Flex gap="6" wrap="wrap">
        <Box>
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            도움됨 응답률
          </Text>
          <StatNumber tone="teal">{rateText(helpfulnessRate)}</StatNumber>
          <Text size="1" color="gray" mt="1" as="p">
            명시적 “도움됨” 피드백
          </Text>
        </Box>

        <Box>
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            행동적 이탈률
          </Text>
          <StatNumber tone="teal">
            {rateText(behavioralDeflectionRate)}
          </StatNumber>
          <Text size="1" color="gray" mt="1" as="p">
            7일 내 상담 미예약 (대상자 기준)
          </Text>
        </Box>

        <Box>
          <Text size="1" color="gray" weight="medium" className="mb-1 block">
            세션 수
          </Text>
          <StatNumber tone="gray">{sessionCount}</StatNumber>
          <Text size="1" color="gray" mt="1" as="p">
            누적 Q&A 세션
          </Text>
        </Box>
      </Flex>
    </Card>
  );
}
