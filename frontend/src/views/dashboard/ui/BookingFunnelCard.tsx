import { Box, Card, Flex, Heading, Text } from '@radix-ui/themes';
import { Eyebrow, Meter, toneText } from '@/shared/ui';
import type { Analytics } from '@/entities/analytics';
import type { FunnelStep } from '../types';

export function BookingFunnelCard({ funnel }: { funnel: Analytics['funnel'] }) {
  const steps: FunnelStep[] = [
    { label: '예약중 (PENDING)',  value: funnel.booked,    tone: 'amber' },
    { label: '예약확정',          value: funnel.confirmed, tone: 'teal'  },
    { label: '완료',              value: funnel.completed, tone: 'teal'  },
    { label: '노쇼',              value: funnel.noShow,    tone: 'red'   },
    { label: '취소',              value: funnel.cancelled, tone: 'gray'  },
  ];
  const total = steps.reduce((s, x) => s + x.value, 0);

  return (
    <Card size="3" className="rise" style={{ animationDelay: '240ms' }}>
      <Flex align="start" justify="between" mb="4" wrap="wrap" gap="2">
        <Box>
          <Eyebrow className="mb-1 tracking-[0.12em]">예약 현황</Eyebrow>
          <Heading size="4" className="font-serif font-medium">
            예약 생애주기 퍼널
          </Heading>
        </Box>
        <Text size="1" color="gray">전체 {total}건</Text>
      </Flex>
      <Flex gap="3" wrap="wrap">
        {steps.map((step) => (
          <Box key={step.label} className="min-w-[100px] flex-1">
            <Text size="1" color="gray" className="mb-1 block">
              {step.label}
            </Text>
            <Text size="5" weight="bold" className={`block ${toneText[step.tone]}`}>
              {step.value}
            </Text>
            <Meter
              className="mt-2"
              height={4}
              tone={step.tone}
              percent={total > 0 ? (step.value / total) * 100 : 0}
            />
          </Box>
        ))}
      </Flex>
    </Card>
  );
}
