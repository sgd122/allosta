import { Card, Text } from '@radix-ui/themes';
import { StatNumber } from '@/shared/ui';
import { formatPercent } from '@/shared/lib/format';
import type { OpsRateCardProps } from '../types';

export function OpsRateCard({ label, sublabel, value, tone, delay }: OpsRateCardProps) {
  return (
    <Card size="3" className="rise min-w-[180px] flex-1" style={{ animationDelay: delay }}>
      <Text size="1" color="gray" weight="medium" className="mb-1 block">
        {label}
      </Text>
      <StatNumber tone={tone}>{formatPercent(value)}</StatNumber>
      <Text size="1" color="gray" mt="1" as="p">
        {sublabel}
      </Text>
    </Card>
  );
}
