import { Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { type Tone, toneText } from './tone';

type Props = {
  children: ReactNode;
  /** Accent tone for the label. Defaults to teal. */
  tone?: Tone;
  /** Extra Tailwind classes appended after the base eyebrow styles. */
  className?: string;
};

/**
 * Small mono, upper-cased, letter-spaced label that sits above a heading.
 * Replaces the repeated inline `var(--font-ibm-plex-mono)` + `var(--{tone}-11)`
 * eyebrow style that appeared across dashboard/cards/dialogs.
 */
export function Eyebrow({ children, tone = 'teal', className = '' }: Props) {
  return (
    <Text
      as="span"
      className={`block font-mono text-[11px] font-semibold uppercase tracking-[0.15em] ${toneText[tone]} ${className}`}
    >
      {children}
    </Text>
  );
}
