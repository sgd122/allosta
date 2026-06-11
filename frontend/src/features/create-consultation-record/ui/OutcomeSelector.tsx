import { Box, Flex, Text } from '@radix-ui/themes';
import { CheckIcon } from '@radix-ui/react-icons';
import type { Outcome } from '@/shared/config';
import { OUTCOMES, OUTCOME_ACTIVE_SURFACE, OUTCOME_ACTIVE_TEXT } from '../constants';

export function OutcomeSelector({
  value,
  onChange,
}: {
  value: Outcome;
  onChange: (o: Outcome) => void;
}) {
  return (
    <Flex gap="2" wrap="wrap" role="radiogroup" aria-label="상담 결과">
      {OUTCOMES.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-w-[120px] flex-[1_1_0] cursor-pointer rounded-3 border border-solid px-[14px] py-2.5 text-left transition-[background-color,border-color] duration-[140ms] ${
              active ? OUTCOME_ACTIVE_SURFACE[o.color] : 'border-gray-5 bg-panel'
            }`}
          >
            <Flex align="center" justify="between" gap="2">
              <Text
                size="2"
                weight={active ? 'bold' : 'medium'}
                className={active ? OUTCOME_ACTIVE_TEXT[o.color] : 'text-gray-12'}
              >
                {o.label}
              </Text>
              {active && (
                <Box className={`flex ${OUTCOME_ACTIVE_TEXT[o.color]}`}>
                  <CheckIcon />
                </Box>
              )}
            </Flex>
            <Text size="1" color="gray" mt="1" className="block">
              {o.hint}
            </Text>
          </button>
        );
      })}
    </Flex>
  );
}
