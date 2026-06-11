import { Card, Text } from '@radix-ui/themes';
import { StatNumber } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';
import type { ChallengeConversionCardProps } from '../types';

/**
 * Renders challenge conversion (AC5): "—" when null (no PURCHASED records yet),
 * "0%" when 0 (purchased exist but none enrolled), else a percentage. The
 * enrollment count is shown as the sublabel.
 */
export function ChallengeConversionCard({ enrollments, conversionRate, delay }: ChallengeConversionCardProps) {
  const display = conversionRate === null ? '—' : formatPercent(conversionRate);
  return (
    <Card size="3" className="rise min-w-[180px] flex-1" style={{ animationDelay: delay }}>
      <Text size="1" color="gray" weight="medium" className="mb-1 block">
        챌린지 전환율
      </Text>
      <StatNumber tone="teal">{display}</StatNumber>
      <Text size="1" color="gray" mt="1" as="p">
        구매 고객 중 챌린지 등록 · 누적 {enrollments}건
      </Text>
    </Card>
  );
}
