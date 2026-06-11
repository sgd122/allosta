import { Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { type Tone, toneText } from './tone';

type Size = 'md' | 'lg' | 'xl';

/** Fluid type ramps matching the previous inline `clamp(...)` values. */
const SIZE_CLASS: Record<Size, string> = {
  md: 'text-[clamp(1.75rem,1.5rem+1vw,2.25rem)]',
  lg: 'text-[clamp(1.75rem,1.2rem+1.5vw,2.25rem)]',
  xl: 'text-[clamp(2.5rem,2rem+2vw,4rem)]',
};

type Props = {
  children: ReactNode;
  /** Accent tone for the figure. Defaults to teal. */
  tone?: Tone;
  size?: Size;
  className?: string;
};

/**
 * Large serif KPI figure. Replaces the repeated inline style block with
 * `fontFamily: var(--font-newsreader)` + `color: var(--{tone}-11)` + `clamp()`.
 */
export function StatNumber({ children, tone = 'teal', size = 'md', className = '' }: Props) {
  return (
    <Text
      className={`block font-serif font-bold leading-none ${SIZE_CLASS[size]} ${toneText[tone]} ${className}`}
    >
      {children}
    </Text>
  );
}
