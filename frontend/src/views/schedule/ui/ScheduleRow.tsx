import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Separator,
  Spinner,
  Text,
} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';
import { useConfirmBookingMutation, useSetAttendanceMutation } from '@/entities/booking';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay, formatTime } from '@/shared/lib/format';
import { ConsultationRecordForm } from '@/features/create-consultation-record';
import { BriefPanel } from '@/features/view-booking-brief';
import { BOOKING_STATUS_BADGE } from '../constants';
import type { RowProps } from '../types';
import { RecordDetailPanel } from './RecordDetailPanel';

export function ScheduleRow({ entry, index, isOpen, onToggle, onRecorded, existingRecord }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  // Reset edit mode whenever the card collapses, so reopening shows the
  // read-only record panel rather than jumping straight back into the form.
  useEffect(() => {
    if (!isOpen) setEditing(false);
  }, [isOpen]);

  const confirmMutation = useConfirmBookingMutation();
  const attendanceMutation = useSetAttendanceMutation();

  const isPastSlot = new Date(entry.slot.endAt) < new Date();
  // Attendance is correctable on a past slot that is CONFIRMED, NO_SHOW, or a
  // COMPLETED booking with no record yet. The last case keeps the toggle
  // available after NO_SHOW → 완료 so it can be reverted; a COMPLETED booking
  // that already has a record is excluded, since flipping it to NO_SHOW would
  // contradict the written record.
  const canCorrectAttendance =
    isPastSlot &&
    (entry.status === 'CONFIRMED' ||
      entry.status === 'NO_SHOW' ||
      (entry.status === 'COMPLETED' && !entry.hasRecord));

  const bookingBadge = BOOKING_STATUS_BADGE[entry.status];

  return (
    <Card
      size="3"
      className="rise"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Flex
        align="center"
        justify="between"
        gap="4"
        className="cursor-pointer"
        onClick={onToggle}
        role="button"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <Flex align="center" gap="5" className="min-w-0 flex-1">
          <Box className="shrink-0">
            <Text size="1" color="gray" className="block font-semibold uppercase tracking-[0.05em]">
              {formatDay(entry.slot.startAt)}
            </Text>
            <Text size="3" className="font-mono font-medium">
              {formatTime(entry.slot.startAt)} – {formatTime(entry.slot.endAt)}
            </Text>
          </Box>
          <Box className="min-w-0">
            <Text size="3" weight="medium">{entry.customerName}</Text>
            <Text size="1" color="gray" className="block">
              {entry.subjectId !== entry.customerId
                ? `가족 · ${entry.subjectName}`
                : '본인 상담'}
            </Text>
          </Box>
        </Flex>

        <Flex align="center" gap="2" className="shrink-0">
          <Badge color={bookingBadge.color} variant={bookingBadge.variant} size="1">
            {bookingBadge.label}
          </Badge>

          {entry.hasRecord ? (
            <Badge color="teal" size="1">기록 완료</Badge>
          ) : (
            <Badge color="amber" variant="soft" size="1">기록 미작성</Badge>
          )}

          <Button variant="ghost" size="1" color="gray">
            {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        </Flex>
      </Flex>

      {entry.status === 'PENDING' && (
        <Box
          mt="3"
          pt="3"
          className="border-t border-gray-4"
          onClick={(e) => e.stopPropagation()}
        >
          {!confirming ? (
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <Text size="2" color="gray">
                아직 확정되지 않은 예약입니다. 일정을 확인하고 예약을 확정해 주세요.
              </Text>
              <Button
                size="2"
                color="teal"
                onClick={() => setConfirming(true)}
              >
                <CheckCircledIcon /> 예약 확인하기
              </Button>
            </Flex>
          ) : (
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <Text size="2" weight="medium">
                이 예약을 확정하시겠어요?
              </Text>
              <Flex gap="2" align="center">
                <Button
                  size="2"
                  variant="soft"
                  color="gray"
                  disabled={confirmMutation.isPending}
                  onClick={() => setConfirming(false)}
                >
                  <Cross2Icon /> 취소
                </Button>
                <Button
                  size="2"
                  color="teal"
                  disabled={confirmMutation.isPending}
                  onClick={() =>
                    confirmMutation.mutate(entry.bookingId, {
                      onSuccess: () => setConfirming(false),
                    })
                  }
                >
                  {confirmMutation.isPending ? <Spinner size="1" /> : <CheckCircledIcon />}
                  예약 확정
                </Button>
              </Flex>
            </Flex>
          )}

          {confirmMutation.isError && (
            <Callout.Root color="red" size="1" mt="2">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>
                {toFriendlyMessage(confirmMutation.error, '예약 확인에 실패했습니다.')}
              </Callout.Text>
            </Callout.Root>
          )}
        </Box>
      )}

      {canCorrectAttendance && (
        <Box
          mt="3"
          pt="3"
          className="border-t border-gray-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Text size="2" color="gray">
              출석 현황을 수정할 수 있습니다.
            </Text>
            <Flex gap="2" align="center">
              <Button
                size="2"
                variant="soft"
                color="teal"
                disabled={attendanceMutation.isPending || entry.status === 'COMPLETED'}
                onClick={() =>
                  attendanceMutation.mutate({ bookingId: entry.bookingId, status: 'COMPLETED' })
                }
              >
                {attendanceMutation.isPending ? <Spinner size="1" /> : <CheckCircledIcon />}
                완료로 변경
              </Button>
              <Button
                size="2"
                variant="soft"
                color="gray"
                disabled={attendanceMutation.isPending || entry.status === 'NO_SHOW'}
                onClick={() =>
                  attendanceMutation.mutate({ bookingId: entry.bookingId, status: 'NO_SHOW' })
                }
              >
                {attendanceMutation.isPending ? <Spinner size="1" /> : <Cross2Icon />}
                노쇼로 변경
              </Button>
            </Flex>
          </Flex>
          {attendanceMutation.isError && (
            <Callout.Root color="red" size="1" mt="2">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>
                {toFriendlyMessage(attendanceMutation.error, '출석 수정에 실패했습니다.')}
              </Callout.Text>
            </Callout.Root>
          )}
        </Box>
      )}

      {isOpen && (
        <Box>
          {entry.hasRecord && existingRecord ? (
            editing ? (
              <Box pt="4">
                <Separator size="4" mb="4" />
                <ConsultationRecordForm
                  bookingId={entry.bookingId}
                  mode="edit"
                  recordId={existingRecord.id}
                  initial={{
                    summary: existingRecord.summary,
                    recommendation: existingRecord.recommendation,
                    followUp: existingRecord.followUp,
                    actions: existingRecord.actions,
                    outcome: existingRecord.outcome,
                    productIds: existingRecord.products.map((p) => p.productId),
                    metricRefs: existingRecord.metrics,
                  }}
                  onSuccess={() => setEditing(false)}
                  onCancel={() => setEditing(false)}
                />
              </Box>
            ) : (
              <RecordDetailPanel record={existingRecord} onEdit={() => setEditing(true)} />
            )
          ) : (
            <Box pt="4">
              <Separator size="4" mb="4" />
              <Box mb="5">
                <BriefPanel bookingId={entry.bookingId} active={isOpen} />
              </Box>
              <ConsultationRecordForm bookingId={entry.bookingId} onSuccess={onRecorded} />
            </Box>
          )}
        </Box>
      )}
    </Card>
  );
}
