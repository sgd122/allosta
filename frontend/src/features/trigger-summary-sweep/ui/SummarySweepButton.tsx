'use client';

import { useState } from 'react';
import { Button, Flex, Spinner, Text } from '@radix-ui/themes';
import { UpdateIcon } from '@radix-ui/react-icons';
import { toFriendlyMessage } from '@/shared/api';
import { useTriggerSummarySweepMutation } from '../api/queries';

/**
 * Admin demo control (ADR 0014): forces one AI-summary upgrade sweep so the
 * dashboard's UPGRADED ratio updates immediately after enabling local Ollama,
 * rather than waiting for the next OpsScheduler interval tick.
 */
export function SummarySweepButton() {
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutation = useTriggerSummarySweepMutation((result) =>
    setFeedback(`업그레이드 ${result.upgraded}건 완료`),
  );

  return (
    <Flex align="center" gap="3" wrap="wrap">
      <Button
        size="2"
        variant="soft"
        color="violet"
        disabled={mutation.isPending}
        onClick={() => {
          setFeedback(null);
          mutation.mutate();
        }}
      >
        {mutation.isPending ? <Spinner size="1" /> : <UpdateIcon />}
        AI 요약 업그레이드 실행
      </Button>
      {feedback && (
        <Text size="1" color="teal">{feedback}</Text>
      )}
      {mutation.isError && (
        <Text size="1" color="red">
          {toFriendlyMessage(mutation.error, '요약 업그레이드에 실패했습니다.')}
        </Text>
      )}
    </Flex>
  );
}
