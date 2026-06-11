import { Box, Flex, SegmentedControl, Text } from '@radix-ui/themes';
import type { DateScope } from '@/shared/lib/date';
import { Eyebrow } from '@/shared/ui';
import { SCHEDULE_SCOPE_OPTIONS, SCHEDULE_STATUS_OPTIONS } from '../constants';
import type { StatusFilter } from '../types';

type Props = {
  scope: DateScope;
  onScopeChange: (scope: DateScope) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  /** Per-status counts within the current date scope, for filter affordances. */
  statusCounts: Record<StatusFilter, number>;
};

/**
 * Two-axis filter bar: a date-scope lens (오늘/예정/지난/전체) and a booking-status
 * filter (전체/예약중/예약완료/완료/노쇼). Counts on the status control reflect the
 * currently scoped entries so an empty filter is self-explanatory.
 */
export function ScheduleToolbar({
  scope,
  onScopeChange,
  status,
  onStatusChange,
  statusCounts,
}: Props) {
  return (
    <Flex
      direction={{ initial: 'column', md: 'row' }}
      gap="4"
      justify="between"
      align={{ initial: 'stretch', md: 'end' }}
      mb="4"
      wrap="wrap"
    >
      <Box>
        <Eyebrow className="mb-1.5 block">기간</Eyebrow>
        <SegmentedControl.Root
          size="2"
          value={scope}
          onValueChange={(value) => onScopeChange(value as DateScope)}
        >
          {SCHEDULE_SCOPE_OPTIONS.map((option) => (
            <SegmentedControl.Item key={option.value} value={option.value}>
              {option.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </Box>

      <Box>
        <Eyebrow className="mb-1.5 block">예약 상태</Eyebrow>
        <SegmentedControl.Root
          size="2"
          value={status}
          onValueChange={(value) => onStatusChange(value as StatusFilter)}
        >
          {SCHEDULE_STATUS_OPTIONS.map((option) => (
            <SegmentedControl.Item key={option.value} value={option.value}>
              {option.label}
              <Text size="1" color="gray" ml="1" className="tabular-nums">
                {statusCounts[option.value]}
              </Text>
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </Box>
    </Flex>
  );
}
