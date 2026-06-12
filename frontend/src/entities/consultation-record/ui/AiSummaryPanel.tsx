import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { MagicWandIcon } from '@radix-ui/react-icons';
import type { ConsultationAiSummary } from '../types';
import { FieldLabel } from '@/shared/ui';

/**
 * Renders the post-consultation AI summary (ADR 0014) with a status badge:
 * UPGRADED (local Ollama, shows the model name) vs FALLBACK (deterministic
 * template). Pure presentational — the counselor sees provenance at a glance.
 */
export function AiSummaryPanel({ summary }: { summary: ConsultationAiSummary }) {
  const isUpgraded = summary.status === 'UPGRADED';

  return (
    <Box>
      <Flex align="center" gap="2" mb="2" wrap="wrap">
        <FieldLabel>AI 요약</FieldLabel>
        {isUpgraded ? (
          <Badge color="violet" variant="solid" size="1">
            <MagicWandIcon /> UPGRADED{summary.model ? ` · ${summary.model}` : ''}
          </Badge>
        ) : (
          <Badge color="gray" variant="soft" size="1">
            FALLBACK · 템플릿
          </Badge>
        )}
      </Flex>
      <Text size="2" as="p" className="whitespace-pre-line">
        {summary.content}
      </Text>
    </Box>
  );
}
