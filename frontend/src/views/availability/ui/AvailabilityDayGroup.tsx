import { Box, Flex, Separator, Text } from '@radix-ui/themes';
import { formatDayHeader, type DayGroup } from '@/shared/lib/date';
import type { AvailabilitySlot } from '@/entities/availability';
import { summarizeSlots } from '../lib/grouping';
import { SlotRow } from './SlotRow';

type Props = {
  group: DayGroup<AvailabilitySlot>;
  /** Running offset so the rise animation stays sequential across day sections. */
  indexOffset: number;
};

/** One dated section: a day header with an open/total tally, then the slot rows. */
export function AvailabilityDayGroup({ group, indexOffset }: Props) {
  const summary = summarizeSlots(group.items);

  return (
    <Box>
      <Flex align="center" gap="3" mb="3">
        <Text size="2" weight="bold">
          {formatDayHeader(group.iso)}
        </Text>
        <Separator size="4" className="flex-1" />
        <Text size="1" color="gray" className="shrink-0 tabular-nums">
          예약 가능 {summary.open} · 전체 {summary.total}
        </Text>
      </Flex>

      <Flex direction="column" gap="3">
        {group.items.map((slot, i) => (
          <SlotRow key={slot.id} slot={slot} index={indexOffset + i} />
        ))}
      </Flex>
    </Box>
  );
}
