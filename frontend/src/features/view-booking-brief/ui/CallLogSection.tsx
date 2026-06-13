'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  IconButton,
  RadioCards,
  Separator,
  Spinner,
  Text,
  TextArea,
} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  MobileIcon,
  Pencil1Icon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { useSetAttendanceMutation } from '@/entities/booking';
import {
  useLogCallMutation,
  useUpdateCallLogMutation,
  useDeleteCallLogMutation,
  type CallOutcome,
} from '@/entities/call-log';
import type { BriefCallLogRecord } from '@/entities/consultation-brief';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay } from '@/shared/lib/format';
import { FieldLabel } from '@/shared/ui';
import { CALL_OUTCOME_LABEL } from '../constants';

type Props = {
  bookingId: string;
  /** The booking's logged calls (newest first), surfaced from the brief. */
  callLogs: BriefCallLogRecord[];
};

const CALL_OUTCOMES: CallOutcome[] = ['CONNECTED', 'NO_ANSWER', 'INVALID'];
const NOTE_MAX = 1000;

/** Radix color per call outcome — connected reads positive, the rest as alerts. */
const OUTCOME_COLOR: Record<CallOutcome, 'teal' | 'amber' | 'red'> = {
  CONNECTED: 'teal',
  NO_ANSWER: 'amber',
  INVALID: 'red',
};

/**
 * Inline call-logging surface in the pre-consultation brief (ADR 0016). Renders
 * the booking's existing call logs (outcome + note + date, newest first) and a
 * single outcome-select + note form reused for BOTH creating a new call and
 * editing an existing one. Editing loads the row's values into the same form;
 * submit issues PATCH instead of POST. When NO_ANSWER attempts accumulate it
 * suggests marking the booking NO_SHOW via the existing attendance PATCH (P5
 * loose coupling — CallLog never writes Booking.status directly).
 */
export function CallLogSection({ bookingId, callLogs }: Props) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showNoShowBanner, setShowNoShowBanner] = useState(false);

  const logCallMutation = useLogCallMutation();
  const updateCallMutation = useUpdateCallLogMutation();
  const deleteCallMutation = useDeleteCallLogMutation();
  const attendanceMutation = useSetAttendanceMutation();

  const isEditing = editingId !== null;
  const isSubmitting = logCallMutation.isPending || updateCallMutation.isPending;
  const noAnswerCount = callLogs.filter((c) => c.outcome === 'NO_ANSWER').length;

  function resetForm() {
    setOutcome(null);
    setNote('');
    setEditingId(null);
    setSubmitError(null);
  }

  function handleStartEdit(record: BriefCallLogRecord) {
    setEditingId(record.id);
    setOutcome(record.outcome);
    setNote(record.note ?? '');
    setSubmitError(null);
    setConfirmDeleteId(null);
  }

  function handleConfirmDelete(callId: string) {
    // If the row being confirmed for deletion is currently open in the edit
    // form, reset the form so the user isn't editing a row that's about to go.
    if (editingId === callId) {
      resetForm();
    }
    setConfirmDeleteId(callId);
  }

  function handleDelete(callId: string) {
    deleteCallMutation.mutate(
      { bookingId, callId },
      {
        onSuccess: () => setConfirmDeleteId(null),
        onError: (err) =>
          setSubmitError(toFriendlyMessage(err, '통화 기록 삭제에 실패했습니다.')),
      },
    );
  }

  function handleSubmit() {
    if (!outcome) return;
    setSubmitError(null);
    const input = { outcome, ...(note.trim() ? { note: note.trim() } : {}) };

    const onError = (err: unknown) =>
      setSubmitError(
        toFriendlyMessage(
          err,
          isEditing ? '통화 기록 수정에 실패했습니다.' : '통화 기록에 실패했습니다.',
        ),
      );

    if (isEditing && editingId) {
      updateCallMutation.mutate(
        { bookingId, callId: editingId, input },
        { onSuccess: resetForm, onError },
      );
      return;
    }

    logCallMutation.mutate(
      { bookingId, input },
      {
        onSuccess: () => {
          if (outcome === 'NO_ANSWER' && noAnswerCount + 1 >= 2) {
            setShowNoShowBanner(true);
          }
          resetForm();
        },
        onError,
      },
    );
  }

  function handleMarkNoShow() {
    attendanceMutation.mutate(
      { bookingId, status: 'NO_SHOW' },
      {
        onSuccess: () => setShowNoShowBanner(false),
        onError: (err) =>
          setSubmitError(toFriendlyMessage(err, '노쇼 처리에 실패했습니다.')),
      },
    );
  }

  return (
    <Box>
      <Separator size="4" mb="4" />

      <FieldLabel>통화 기록</FieldLabel>

      {callLogs.length > 0 && (
        <Flex direction="column" gap="2" mb="4">
          {callLogs.map((record) => (
            <Flex
              key={record.id}
              align="start"
              justify="between"
              gap="2"
              className="rounded-2 border border-gray-4 p-3"
            >
              <Box>
                <Flex align="center" gap="2" mb="1" wrap="wrap">
                  <Badge
                    color={OUTCOME_COLOR[record.outcome]}
                    variant="soft"
                    size="1"
                  >
                    {CALL_OUTCOME_LABEL[record.outcome]}
                  </Badge>
                  <Text size="1" color="gray">{formatDay(record.createdAt)}</Text>
                </Flex>
                {record.note && (
                  <Text size="2" as="p" className="text-gray-12">
                    {record.note}
                  </Text>
                )}
              </Box>
              {confirmDeleteId === record.id ? (
                <Flex align="center" gap="1" className="shrink-0">
                  <Text size="1" weight="medium">삭제할까요?</Text>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="삭제 취소"
                    disabled={deleteCallMutation.isPending}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    <Cross2Icon />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="soft"
                    color="red"
                    aria-label="삭제 확인"
                    disabled={deleteCallMutation.isPending}
                    onClick={() => handleDelete(record.id)}
                  >
                    {deleteCallMutation.isPending ? <Spinner size="1" /> : <TrashIcon />}
                  </IconButton>
                </Flex>
              ) : (
                <Flex align="center" gap="1" className="shrink-0">
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="통화 기록 수정"
                    disabled={isSubmitting || deleteCallMutation.isPending}
                    onClick={() => handleStartEdit(record)}
                  >
                    <Pencil1Icon />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    aria-label="통화 기록 삭제"
                    disabled={isSubmitting || deleteCallMutation.isPending}
                    onClick={() => handleConfirmDelete(record.id)}
                  >
                    <TrashIcon />
                  </IconButton>
                </Flex>
              )}
            </Flex>
          ))}
        </Flex>
      )}

      {isEditing && (
        <Flex align="center" gap="2" mb="2">
          <Pencil1Icon className="text-gray-11" />
          <Text size="1" color="gray">통화 기록을 수정하고 있습니다.</Text>
        </Flex>
      )}

      <RadioCards.Root
        value={outcome ?? ''}
        onValueChange={(v) => setOutcome(v as CallOutcome)}
        columns={{ initial: '1', sm: '3' }}
        size="1"
        mb="3"
      >
        {CALL_OUTCOMES.map((o) => (
          <RadioCards.Item key={o} value={o}>
            <Flex align="center" gap="2">
              <MobileIcon />
              <Text size="2">{CALL_OUTCOME_LABEL[o]}</Text>
            </Flex>
          </RadioCards.Item>
        ))}
      </RadioCards.Root>

      <Box mb="3">
        <Flex align="center" justify="between" gap="2" mb="1.5" wrap="wrap">
          <Text size="1" color="gray">메모 (선택)</Text>
          <Text size="1" color="gray" className="tabular-nums">
            {note.length}/{NOTE_MAX}
          </Text>
        </Flex>
        <TextArea
          rows={2}
          maxLength={NOTE_MAX}
          placeholder="통화 내용에 대한 짧은 메모를 남길 수 있습니다. (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="통화 메모 (선택)"
          disabled={isSubmitting}
        />
      </Box>

      {submitError && (
        <Callout.Root color="red" size="1" mb="3" role="alert">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{submitError}</Callout.Text>
        </Callout.Root>
      )}

      {showNoShowBanner && (
        <Callout.Root color="amber" size="1" mb="3" role="status">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>
            연락이 2회 이상 되지 않았습니다. 노쇼로 처리하시겠어요?
          </Callout.Text>
          <Flex gap="2" align="center" mt="2">
            <Button
              size="1"
              variant="soft"
              color="gray"
              disabled={attendanceMutation.isPending}
              onClick={() => setShowNoShowBanner(false)}
            >
              <Cross2Icon /> 닫기
            </Button>
            <Button
              size="1"
              color="amber"
              disabled={attendanceMutation.isPending}
              onClick={handleMarkNoShow}
            >
              {attendanceMutation.isPending ? (
                <Spinner size="1" />
              ) : (
                <CheckCircledIcon />
              )}
              노쇼 처리
            </Button>
          </Flex>
        </Callout.Root>
      )}

      <Flex justify="between" align="center" gap="3" wrap="wrap">
        {noAnswerCount > 0 && (
          <Badge color="amber" variant="soft" size="1">
            부재중 {noAnswerCount}회
          </Badge>
        )}
        <Box flexGrow="1" />
        {isEditing && (
          <Button
            size="2"
            variant="soft"
            color="gray"
            disabled={isSubmitting}
            onClick={resetForm}
          >
            <Cross2Icon /> 취소
          </Button>
        )}
        <Button
          size="2"
          color="teal"
          disabled={!outcome || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? <Spinner size="1" /> : <MobileIcon />}
          {isEditing ? '수정 저장' : '통화 기록'}
        </Button>
      </Flex>
    </Box>
  );
}
