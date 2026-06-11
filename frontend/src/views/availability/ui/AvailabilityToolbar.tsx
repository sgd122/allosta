import { Box, SegmentedControl } from '@radix-ui/themes';
import type { DateScope } from '@/shared/lib/date';
import { Eyebrow } from '@/shared/ui';
import { AVAILABILITY_SCOPE_OPTIONS } from '../constants';

type Props = {
  scope: DateScope;
  onScopeChange: (scope: DateScope) => void;
};

/** Date-scope lens for the slot list (오늘 / 예정 / 전체). */
export function AvailabilityToolbar({ scope, onScopeChange }: Props) {
  return (
    <Box mb="4">
      <Eyebrow className="mb-1.5 block">기간</Eyebrow>
      <SegmentedControl.Root
        size="2"
        value={scope}
        onValueChange={(value) => onScopeChange(value as DateScope)}
      >
        {AVAILABILITY_SCOPE_OPTIONS.map((option) => (
          <SegmentedControl.Item key={option.value} value={option.value}>
            {option.label}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
    </Box>
  );
}
