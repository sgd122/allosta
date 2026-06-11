import { Box, Flex, Separator, Text } from '@radix-ui/themes';
import { formatDayHeader, type DayGroup } from '@/shared/lib/date';
import type { ScheduleEntry } from '@/entities/schedule';
import type { CounselorRecordEntry } from '@/entities/consultation-record';
import { ScheduleRow } from './ScheduleRow';

type Props = {
  group: DayGroup<ScheduleEntry>;
  /** Running index offset so rise animation delays stay sequential across days. */
  indexOffset: number;
  activeBookingId: string | null;
  onToggle: (bookingId: string) => void;
  onRecorded: () => void;
  recordByBookingId: Map<string, CounselorRecordEntry>;
};

/** One dated section: a day header with its booking count, then the rows. */
export function ScheduleDayGroup({
  group,
  indexOffset,
  activeBookingId,
  onToggle,
  onRecorded,
  recordByBookingId,
}: Props) {
  return (
    <Box>
      <Flex align="center" gap="3" mb="3">
        <Text size="2" weight="bold">
          {formatDayHeader(group.iso)}
        </Text>
        <Separator size="4" className="flex-1" />
        <Text size="1" color="gray" className="shrink-0 tabular-nums">
          {group.items.length}건
        </Text>
      </Flex>

      <Flex direction="column" gap="3">
        {group.items.map((entry, i) => (
          <ScheduleRow
            key={entry.bookingId}
            entry={entry}
            index={indexOffset + i}
            isOpen={activeBookingId === entry.bookingId}
            onToggle={() => onToggle(entry.bookingId)}
            onRecorded={onRecorded}
            existingRecord={recordByBookingId.get(entry.bookingId)}
          />
        ))}
      </Flex>
    </Box>
  );
}
