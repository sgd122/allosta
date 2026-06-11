import { Box, Flex, Heading, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

type Props = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional control rendered inline to the right of the title (e.g. an action button). */
  action?: ReactNode;
};

/**
 * The standard page masthead — eyebrow, serif H1 on the shared clamp scale, and
 * a gray description. Replaces the `text-[clamp(...)]` hero block that was copied
 * across every view page.
 */
export function PageHeader({ eyebrow, title, description, action }: Props) {
  const heading = (
    <Heading
      as="h1"
      mt={action ? undefined : '2'}
      className="font-serif font-medium text-[clamp(1.75rem,1.2rem+1.5vw,2.25rem)]"
    >
      {title}
    </Heading>
  );

  return (
    <Box mb="6" className="rise">
      <Eyebrow>{eyebrow}</Eyebrow>
      {action ? (
        <Flex align="end" justify="between" wrap="wrap" gap="3" mt="2">
          {heading}
          {action}
        </Flex>
      ) : (
        heading
      )}
      {description && (
        <Text size="2" color="gray" mt="2" as="p">
          {description}
        </Text>
      )}
    </Box>
  );
}
