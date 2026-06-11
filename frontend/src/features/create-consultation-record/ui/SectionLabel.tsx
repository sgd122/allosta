import { Box, Flex, Text } from '@radix-ui/themes';
import type { SectionLabelProps } from '../types';

export function SectionLabel({ icon, title, hint, required, trailing }: SectionLabelProps) {
  return (
    <Box mb="3">
      <Flex align="center" justify="between" gap="2">
        <Flex align="center" gap="2">
          <Box className="flex text-teal-10">{icon}</Box>
          <Text size="2" weight="bold">{title}</Text>
          {required && (
            <Text size="1" weight="medium" className="text-red-10">
              필수
            </Text>
          )}
        </Flex>
        {trailing}
      </Flex>
      {hint && (
        <Text size="1" color="gray" mt="1" as="p" className="leading-[1.5]">
          {hint}
        </Text>
      )}
    </Box>
  );
}
