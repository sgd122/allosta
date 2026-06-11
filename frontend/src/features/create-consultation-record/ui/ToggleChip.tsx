import { Box } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { CheckIcon } from '@radix-ui/react-icons';

/**
 * Toggle chip shared by the product and consultation-action multi-selects.
 * Selected state uses a teal surface; unselected falls back to the panel token.
 */
export function ToggleChip({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-4 border border-solid px-3 py-[7px] transition-[background-color,border-color] duration-[120ms] ${
        checked ? 'border-teal-7 bg-teal-3 text-teal-11' : 'border-gray-5 bg-panel text-gray-12'
      }`}
    >
      <Box className={`flex h-3.5 w-3.5 items-center justify-center ${checked ? 'text-teal-11' : 'text-gray-8'}`}>
        {checked ? <CheckIcon /> : <Box className="h-[9px] w-[9px] rounded-full border-[1.5px] border-solid border-gray-7" />}
      </Box>
      {children}
    </button>
  );
}
