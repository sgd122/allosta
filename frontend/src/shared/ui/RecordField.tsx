import { Box, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';

type FieldLabelProps = {
  children: ReactNode;
};

/**
 * The small upper-cased gray label that heads each consultation-record field
 * (summary / recommendation / follow-up / badge groups). Extracted so the
 * `uppercase tracking-[0.06em]` styling lives in one place.
 */
export function FieldLabel({ children }: FieldLabelProps) {
  return (
    <Text size="1" weight="bold" color="gray" className="mb-1.5 block uppercase tracking-[0.06em]">
      {children}
    </Text>
  );
}

type RecordTextFieldProps = {
  label: string;
  value?: string | null;
  /** Bottom margin on the Radix spacing scale. Omit inside a gap-based flex column. */
  mb?: '1' | '2' | '3' | '4';
};

/**
 * A labeled free-text field that renders nothing when the value is empty.
 * Replaces the repeated `{value && (<Box><label/><Text/></Box>)}` blocks across
 * the dashboard drilldown and the counselor schedule record panel.
 */
export function RecordTextField({ label, value, mb }: RecordTextFieldProps) {
  if (!value) return null;
  return (
    <Box mb={mb}>
      <FieldLabel>{label}</FieldLabel>
      <Text size="2">{value}</Text>
    </Box>
  );
}
