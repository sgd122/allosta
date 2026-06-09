import type { Config } from 'tailwindcss';

/**
 * Tailwind is layered ON TOP of Radix Themes — it owns layout, spacing,
 * typography and one-off styling, while Radix owns the component primitives
 * and the runtime color/theme system.
 *
 * Colors and radii are mapped to Radix's runtime CSS variables (e.g.
 * `--teal-11`, `--radius-3`) rather than hardcoded values. This means a class
 * like `text-teal-11` resolves to the exact same token Radix components use,
 * and it stays automatically correct when Radix swaps the palette (e.g. dark
 * mode), with zero duplicated color values.
 *
 * `preflight` is disabled: Radix Themes ships its own CSS reset, so Tailwind's
 * base reset would fight it. We keep Tailwind's utilities/components layers
 * only. Consequence: the bare `border` utility has no default color — always
 * pair it with a color (`border border-gray-5`).
 */

/** Build a 1–12 Radix step scale backed by runtime CSS variables. */
const radixScale = (name: string): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [String(i + 1), `var(--${name}-${i + 1})`]),
  );

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        teal: radixScale('teal'),
        gray: radixScale('gray'),
        amber: radixScale('amber'),
        red: radixScale('red'),
        blue: radixScale('blue'),
        violet: radixScale('violet'),
        // Semantic surface tokens from Radix Themes.
        background: 'var(--color-background)',
        panel: 'var(--color-panel-solid)',
        // Brand semantic colors for charts (kept in sync with globals.css).
        purchased: 'var(--c-purchased)',
        onhold: 'var(--c-onhold)',
        rejected: 'var(--c-rejected)',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', "'SF Mono'", 'monospace'],
        serif: ['var(--font-newsreader)', 'Georgia', "'Times New Roman'", 'serif'],
      },
      borderRadius: {
        '1': 'var(--radius-1)',
        '2': 'var(--radius-2)',
        '3': 'var(--radius-3)',
        '4': 'var(--radius-4)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
