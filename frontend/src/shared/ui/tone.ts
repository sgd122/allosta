/**
 * Static Tailwind class maps for Radix accent tones.
 *
 * Tailwind classes must be statically analyzable, so a dynamic
 * `text-${color}-11` template never works — the class gets purged. These maps
 * turn a runtime tone name into a real, compiled utility class.
 */

export type Tone = 'teal' | 'amber' | 'red' | 'gray' | 'blue' | 'violet';

/** Text color at step 11 (accessible foreground accent). */
export const toneText: Record<Tone, string> = {
  teal: 'text-teal-11',
  amber: 'text-amber-11',
  red: 'text-red-11',
  gray: 'text-gray-11',
  blue: 'text-blue-11',
  violet: 'text-violet-11',
};

/** Solid fill at step 9 (the saturated brand step) — for meters/swatches. */
export const toneFill: Record<Tone, string> = {
  teal: 'bg-teal-9',
  amber: 'bg-amber-9',
  red: 'bg-red-9',
  gray: 'bg-gray-9',
  blue: 'bg-blue-9',
  violet: 'bg-violet-9',
};
