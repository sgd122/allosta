'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  RadioCards,
  Spinner,
  Text,
  TextArea,
} from '@radix-ui/themes';
import { Cross2Icon, ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { createBooking, invalidateAfterBookingCreated } from '@/entities/booking';
import { useFamilyMembers } from '@/entities/family-link';
import {
  createReportCatalog,
  formatServiceType,
  useTestResults,
  type TestReport,
} from '@/entities/test-result';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay, formatTime } from '@/shared/lib/format';
import { Eyebrow } from '@/shared/ui';
import { bookingInputForReport } from '../model/booking-intent';
import type { CompleteBookingDialogProps } from '../types';

export function CompleteBookingDialog({ intent, onClose, onCompleted, onConflict }: CompleteBookingDialogProps) {
  const queryClient = useQueryClient();
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [concern, setConcern] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const CONCERN_MAX = 1000;

  const testResultsQuery = useTestResults();
  const familyQuery = useFamilyMembers();

  const catalog = useMemo(
    () => createReportCatalog(testResultsQuery.data ?? [], familyQuery.data ?? []),
    [testResultsQuery.data, familyQuery.data],
  );

  const mutation = useMutation({
    mutationFn: ({ report }: { report: TestReport }) => {
      if (!intent) throw new Error('예약할 슬롯을 찾지 못했습니다.');
      return createBooking(bookingInputForReport(intent, report, concern));
    },
    onSuccess: async () => {
      if (!intent) return;
      await invalidateAfterBookingCreated(queryClient);
      setSelectedReportKey(null);
      setConcern('');
      setSubmitError(null);
      onCompleted?.();
    },
    onError: (err) => {
      // pfetch throws `Error('<status>: <body>')`, so the status is the leading
      // token. Anchor on a 409 word boundary so a body that merely contains
      // "409" (or a status like 4090) can't false-positive.
      const isConflict = err instanceof Error && /^409\b/.test(err.message);
      if (isConflict) {
        void queryClient.invalidateQueries({ queryKey: ['availabilityCalendar'] });
        onClose();
        onConflict?.();
        return;
      }
      setSubmitError(toFriendlyMessage(err, '예약에 실패했습니다.'));
    },
  });

  useEffect(() => {
    setSelectedReportKey(null);
    setConcern('');
    setSubmitError(null);
    mutation.reset();
    // Reset all dialog-local state whenever a different slot intent is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.slotId]);

  const open = intent !== null;
  const reports = catalog.reports;
  const hasResults = reports.length > 0;
  const range = intent ? `${formatTime(intent.startAt)}–${formatTime(intent.endAt)}` : '';
  const dayLabel = intent ? formatDay(intent.startAt) : '';

  function handleConfirm() {
    const report = reports.find((item) => item.key === selectedReportKey);
    if (!report) return;
    mutation.mutate({ report });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Content style={{ maxWidth: 520 }}>
        <Flex align="start" justify="between" mb="4">
          <Box>
            <Eyebrow className="mb-1 tracking-[0.12em]">상담 예약</Eyebrow>
            <Dialog.Title className="mb-1 font-serif font-medium">
              검사 결과 선택
            </Dialog.Title>
            <Dialog.Description size="2" color="gray">
              {dayLabel}
              {' · '}
              <Text className="font-mono">{range}</Text>
              {' 예약을 위해 상담에 사용할 검사 결과서를 선택하세요.'}
            </Dialog.Description>
          </Box>
          <Dialog.Close>
            <Button variant="ghost" color="gray" size="2" aria-label="닫기">
              <Cross2Icon />
            </Button>
          </Dialog.Close>
        </Flex>

        {testResultsQuery.isLoading && (
          <Flex justify="center" py="6">
            <Spinner size="3" />
          </Flex>
        )}

        {!testResultsQuery.isLoading && !hasResults && (
          <Callout.Root color="amber">
            <Callout.Icon><InfoCircledIcon /></Callout.Icon>
            <Callout.Text>
              선택할 수 있는 검사 결과가 없습니다. 본인 또는 연동된 가족의 검사 결과가 있어야 예약할 수 있습니다.
            </Callout.Text>
          </Callout.Root>
        )}

        {!testResultsQuery.isLoading && hasResults && (
          <RadioCards.Root
            value={selectedReportKey ?? ''}
            onValueChange={setSelectedReportKey}
            columns={{ initial: '1', sm: '2' }}
            size="1"
          >
            {reports.map((report) => (
              <RadioCards.Item key={report.key} value={report.key}>
                <Flex direction="column" gap="2" align="start" width="100%">
                  <Flex align="center" gap="2" wrap="wrap">
                    <Text size="2" weight="medium">검사 결과서</Text>
                    <Badge size="1" color={report.isFamily ? 'amber' : 'teal'} variant="soft">
                      {report.subjectName}
                    </Badge>
                  </Flex>
                  <Text size="1" color="gray">
                    {report.results.map((result) => formatServiceType(result.serviceType)).join(', ')}
                  </Text>
                  <Text size="1" color="gray" className="font-mono">
                    {formatDay(report.createdAt)} · 검사 {report.results.length}종
                  </Text>
                </Flex>
              </RadioCards.Item>
            ))}
          </RadioCards.Root>
        )}

        {!testResultsQuery.isLoading && hasResults && (
          <Box mt="4">
            <Flex align="center" justify="between" gap="2" mb="1.5" wrap="wrap">
              <Eyebrow tone="gray">사전 질문 (선택)</Eyebrow>
              <Text size="1" color="gray" className="tabular-nums">
                {concern.length}/{CONCERN_MAX}
              </Text>
            </Flex>
            <TextArea
              rows={3}
              maxLength={CONCERN_MAX}
              placeholder="상담사에게 미리 전하고 싶은 궁금한 점이 있다면 적어주세요. (선택)"
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              aria-label="상담 사전 질문 (선택)"
            />
            <Text size="1" color="gray" mt="1" as="p">
              입력한 내용은 담당 상담사의 사전 브리핑에만 표시됩니다.
            </Text>
          </Box>
        )}

        {submitError && (
          <Callout.Root color="red" mt="4" role="alert">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{submitError}</Callout.Text>
          </Callout.Root>
        )}

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" size="2" disabled={mutation.isPending}>
              취소
            </Button>
          </Dialog.Close>
          <Button
            size="2"
            color="teal"
            onClick={handleConfirm}
            disabled={!selectedReportKey || mutation.isPending || !hasResults}
          >
            {mutation.isPending ? '예약 중…' : '예약 확정'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
