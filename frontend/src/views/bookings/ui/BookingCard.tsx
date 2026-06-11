import { Badge, Box, Button, Callout, Card, Flex, Spinner, Text } from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useCancelBookingMutation } from '@/entities/booking';
import type { MyBooking } from '@/entities/booking';
import { formatServiceType, type TestReport } from '@/entities/test-result';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay, formatTime } from '@/shared/lib/format';
import { STATUS_CONFIG, CANCELLABLE } from '../constants';

export function BookingCard({
  booking,
  report,
  index,
}: {
  booking: MyBooking;
  report?: TestReport;
  index: number;
}) {
  const cfg = STATUS_CONFIG[booking.status];

  // A booking anchors a single testResultId, but it is really for the whole
  // visit-level 검사 결과서 — so show the report's tests, not one serviceType.
  const reportSummary = report
    ? report.results.map((r) => formatServiceType(r.serviceType)).join(', ')
    : booking.serviceType
      ? formatServiceType(booking.serviceType)
      : null;

  const cancelMutation = useCancelBookingMutation();

  const canCancel = CANCELLABLE.has(booking.status);

  function handleCancel() {
    if (window.confirm('이 예약을 취소하시겠습니까?')) {
      cancelMutation.mutate(booking.id);
    }
  }

  return (
    <Card
      size="3"
      className="rise"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Flex align="center" justify="between" gap="4">
        <Flex align="center" gap="5" className="flex-1 min-w-0">
          <Box className="shrink-0">
            <Text
              size="1"
              color="gray"
              className="font-semibold uppercase tracking-[0.05em] block"
            >
              {formatDay(booking.slot.startAt)}
            </Text>
            <Text size="3" className="font-mono font-medium">
              {formatTime(booking.slot.startAt)} – {formatTime(booking.slot.endAt)}
            </Text>
          </Box>

          {reportSummary && (
            <Box className="min-w-0">
              <Flex align="center" gap="2" mb="1">
                <Text
                  size="1"
                  color="gray"
                  className="font-semibold uppercase tracking-[0.06em]"
                >
                  검사 결과서
                </Text>
                {report && (
                  <Badge color={report.isFamily ? 'amber' : 'teal'} variant="soft" size="1" radius="full">
                    {report.subjectName}
                  </Badge>
                )}
              </Flex>
              <Text size="2" weight="medium">
                {reportSummary}
              </Text>
            </Box>
          )}
        </Flex>

        <Flex align="center" gap="3" className="shrink-0">
          <Badge color={cfg.color} variant={cfg.variant} size="2">
            {cfg.label}
          </Badge>
          {canCancel && (
            <Button
              variant="soft"
              color="gray"
              size="2"
              disabled={cancelMutation.isPending}
              onClick={handleCancel}
            >
              {cancelMutation.isPending ? <Spinner size="1" /> : null}
              예약 취소
            </Button>
          )}
        </Flex>
      </Flex>

      {cancelMutation.isError && (
        <Callout.Root color="red" size="1" mt="3">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>
            {toFriendlyMessage(cancelMutation.error, '예약 취소에 실패했습니다.')}
          </Callout.Text>
        </Callout.Root>
      )}
    </Card>
  );
}
