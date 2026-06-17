'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Spinner,
  Text,
  TextArea,
} from '@radix-ui/themes';
import {
  ChatBubbleIcon,
  ExclamationTriangleIcon,
  PaperPlaneIcon,
} from '@radix-ui/react-icons';
import {
  useAskQuestionMutation,
  useCreateQaSessionMutation,
  useQaSession,
  useSubmitFeedbackMutation,
  type QaFeedback,
  type QaMessage,
} from '@/entities/qa';
import { formatMetricKey } from '@/entities/test-result';
import { toFriendlyMessage } from '@/shared/api';
import { isEscalation } from '../model/escalation';

type Props = {
  testResultId: string;
};

/**
 * Customer-facing AI Q&A surface for one test report (ADR 0018, AC1/2/5/7).
 * Interpretation-only: the session is created lazily on the first question. An
 * out-of-scope question is declined server-side (escalate=true) and rendered
 * with a disclaimer + a booking CTA into the existing /book flow — the only
 * place the CTA appears (in-scope answers stay clean, AC5/AC8).
 */
export function QaPanel({ testResultId }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [askError, setAskError] = useState<string | null>(null);

  const sessionQuery = useQaSession(sessionId);
  const createSession = useCreateQaSessionMutation();
  const askQuestionMutation = useAskQuestionMutation();
  const feedbackMutation = useSubmitFeedbackMutation(sessionId ?? '');
  const messages = sessionQuery.data?.messages ?? [];

  // Derived from the mutations — no duplicated `isAsking` state to keep in sync.
  const isAsking = createSession.isPending || askQuestionMutation.isPending;

  const handleSubmit = async (): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed || isAsking) {
      return;
    }
    setAskError(null);
    try {
      // Create the session lazily so opening the panel costs nothing (AC1). The
      // id is known only after create resolves, so it's passed per-ask call.
      let activeId = sessionId;
      if (!activeId) {
        const session = await createSession.mutateAsync(testResultId);
        activeId = session.id;
        setSessionId(session.id);
      }
      await askQuestionMutation.mutateAsync({
        sessionId: activeId,
        question: trimmed,
      });
      setQuestion('');
    } catch (error: unknown) {
      setAskError(
        toFriendlyMessage(error, '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.'),
      );
    }
  };

  const handleFeedback = (messageId: string, feedback: QaFeedback): void => {
    if (feedbackMutation.isPending) {
      return;
    }
    feedbackMutation.mutate({ messageId, feedback });
  };

  return (
    <Box mt="4" data-testid="qa-panel">
      <Flex align="center" gap="2" mb="3" wrap="wrap">
        <ChatBubbleIcon className="text-teal-9" />
        <Text size="2" weight="medium">
          검사 결과 AI 질문
        </Text>
        <Text size="1" color="gray">
          수치 해석만 도와드려요 · 진단·처방은 상담으로 안내해요
        </Text>
      </Flex>

      {messages.length > 0 && (
        <Flex direction="column" gap="3" mb="3">
          {messages.map((message, index) => (
            <QaTurn
              key={message.id}
              message={message}
              escalate={isEscalation(messages, index)}
              onFeedback={handleFeedback}
              isFeedbackPending={feedbackMutation.isPending}
            />
          ))}
        </Flex>
      )}

      {askError && (
        <Callout.Root color="red" mb="3" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{askError}</Callout.Text>
        </Callout.Root>
      )}

      <Flex direction="column" gap="2">
        <TextArea
          placeholder="예: 공복혈당이 무슨 뜻인가요?"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={isAsking}
          data-testid="qa-input"
        />
        <Flex justify="end">
          <Button
            onClick={() => void handleSubmit()}
            disabled={isAsking || question.trim().length === 0}
            data-testid="qa-submit"
          >
            {isAsking ? <Spinner /> : <PaperPlaneIcon />} 질문하기
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}

type QaTurnProps = {
  message: QaMessage;
  escalate: boolean;
  onFeedback: (messageId: string, feedback: QaFeedback) => void;
  isFeedbackPending: boolean;
};

function QaTurn({
  message,
  escalate,
  onFeedback,
  isFeedbackPending,
}: QaTurnProps) {
  if (message.role === 'USER') {
    return (
      <Flex justify="end">
        <Card
          size="1"
          className="bg-teal-3 max-w-[85%]"
          data-testid="qa-turn-user"
        >
          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
            {message.text}
          </Text>
        </Card>
      </Flex>
    );
  }

  return (
    <Card size="2" className="max-w-[95%]" data-testid="qa-turn-assistant">
      <Text size="2" as="div" style={{ whiteSpace: 'pre-wrap' }}>
        {message.text}
      </Text>

      {message.groundedMetricRefs.length > 0 && (
        <Flex gap="1" mt="2" wrap="wrap">
          {message.groundedMetricRefs.map((ref) => (
            <Badge key={ref} color="teal" variant="soft" size="1" radius="full">
              {formatMetricKey(ref)}
            </Badge>
          ))}
        </Flex>
      )}

      {escalate && (
        <Box mt="3">
          <Callout.Root color="amber" size="1" mb="2">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              이 내용은 AI 해석 범위를 벗어나요. 정확한 안내는 상담사와 상담해 주세요.
            </Callout.Text>
          </Callout.Root>
          <Button asChild color="teal" data-testid="qa-booking-cta">
            <Link href="/book">상담 예약하기</Link>
          </Button>
        </Box>
      )}

      <Box mt="3">
        {message.feedback ? (
          <Text size="1" color="gray" data-testid="qa-feedback-done">
            평가해 주셔서 감사합니다 ({message.feedback === 'YES' ? '예' : '아니오'})
          </Text>
        ) : (
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="1" color="gray">
              이 답변이 도움이 되었나요?
            </Text>
            <Button
              size="1"
              variant="soft"
              color="teal"
              disabled={isFeedbackPending}
              onClick={() => onFeedback(message.id, 'YES')}
              data-testid="qa-feedback-yes"
            >
              예
            </Button>
            <Button
              size="1"
              variant="soft"
              color="gray"
              disabled={isFeedbackPending}
              onClick={() => onFeedback(message.id, 'NO')}
              data-testid="qa-feedback-no"
            >
              아니오
            </Button>
          </Flex>
        )}
      </Box>
    </Card>
  );
}
