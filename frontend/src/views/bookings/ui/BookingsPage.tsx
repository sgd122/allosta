'use client';

import { useMemo, useState } from 'react';
import { Box, Callout, Card, Flex, Spinner, Text } from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useMyBookings } from '@/entities/booking';
import { useFamilyMembers } from '@/entities/family-link';
import { useMyWaitlist } from '@/entities/waitlist';
import { useTestResults, createReportCatalog } from '@/entities/test-result';
import { toFriendlyMessage } from '@/shared/api';
import { Eyebrow, PageHeader } from '@/shared/ui';
import { CompleteBookingDialog, bookingIntentFromWaitlistOffer, type BookingIntent } from '@/features/complete-booking';
import { BookingCard } from './BookingCard';
import { WaitlistOfferCard } from './WaitlistOfferCard';

export default function BookingsPage() {
  const [activeIntent, setActiveIntent] = useState<BookingIntent | null>(null);
  const { data, isLoading, isError, error } = useMyBookings();
  const { data: waitlistData } = useMyWaitlist();
  const { data: testResults } = useTestResults();
  const { data: familyMembers } = useFamilyMembers();

  // Resolve each booking's testResultId → the visit-level 검사 결과서 it belongs to.
  const reportCatalog = useMemo(
    () => createReportCatalog(testResults ?? [], familyMembers ?? []),
    [testResults, familyMembers],
  );

  const bookings = data ?? [];
  const activeOffers = (waitlistData ?? []).filter(
    (e) => e.status === 'NOTIFIED' && e.offeredSlot != null,
  );

  return (
    <Box>
      <PageHeader
        eyebrow="고객 포털"
        title="내 예약"
        description={`총 예약 ${bookings.length}건`}
      />

      {activeOffers.length > 0 && (
        <Box mb="6">
          <Eyebrow tone="amber" className="mb-3 tracking-[0.12em]">대기 알림</Eyebrow>
          <Flex direction="column" gap="3">
            {activeOffers.map((entry) => (
              <WaitlistOfferCard
                key={entry.id}
                entry={entry}
                onBookOffer={(offer) =>
                  setActiveIntent(bookingIntentFromWaitlistOffer({ waitlistId: offer.id, slot: offer.offeredSlot }))
                }
              />
            ))}
          </Flex>
        </Box>
      )}

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}

      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {toFriendlyMessage(error, '예약 내역을 불러오지 못했습니다.')}
          </Callout.Text>
        </Callout.Root>
      )}

      {!isLoading && !isError && bookings.length === 0 && (
        <Card size="4" className="text-center">
          <Text size="2" color="gray">
            예약 내역이 없습니다.
          </Text>
        </Card>
      )}

      <Flex direction="column" gap="3">
        {bookings.map((booking, i) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            report={booking.testResultId ? reportCatalog.reportByResultId.get(booking.testResultId) : undefined}
            index={i}
          />
        ))}
      </Flex>

      <CompleteBookingDialog
        intent={activeIntent}
        onClose={() => setActiveIntent(null)}
        onCompleted={() => setActiveIntent(null)}
      />
    </Box>
  );
}
