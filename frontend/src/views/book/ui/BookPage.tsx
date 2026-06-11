'use client';

import { useState } from 'react';
import { Box, Callout, Flex, Heading, Text } from '@radix-ui/themes';
import { CheckIcon } from '@radix-ui/react-icons';
import {
  BookingCalendar,
  useAvailabilityCalendar,
} from '@/entities/booking';
import { Eyebrow } from '@/shared/ui';
import type { AggregatedSlot } from '@/entities/booking';
import { CompleteBookingDialog, bookingIntentFromAggregatedSlot, type BookingIntent } from '@/features/complete-booking';
import { FamilyLinkPanel } from '@/features/manage-family-links';
import { toFriendlyMessage } from '@/shared/api';

export default function BookPage() {
  const [activeIntent, setActiveIntent] = useState<BookingIntent | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const calendarQuery = useAvailabilityCalendar();

  function handlePickSlot(slot: AggregatedSlot) {
    setSuccessText(null);
    setActiveIntent(bookingIntentFromAggregatedSlot(slot));
  }

  function handleCompleted() {
    setActiveIntent(null);
    setSuccessText('예약이 완료되었습니다. 알림으로 안내드릴게요.');
  }

  return (
    <Box>
      <Box mb="6" className="rise">
        <Eyebrow>상담 예약</Eyebrow>
        <Heading
          as="h1"
          mt="2"
          className="font-serif font-medium text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)]"
        >
          편한 날짜에 <em className="italic text-teal-9">상담</em>을 예약하세요
        </Heading>
        <Text size="2" color="gray" mt="2" as="p">
          달력에서 가능한 날짜를 고르고, 시간을 선택해 예약을 완료하세요.
        </Text>
      </Box>

      {successText && (
        <Callout.Root color="teal" mb="5" role="status">
          <Callout.Icon><CheckIcon /></Callout.Icon>
          <Callout.Text>{successText}</Callout.Text>
        </Callout.Root>
      )}

      <Flex gap="5" align="start" direction={{ initial: 'column', md: 'row' }}>
        <BookingCalendar
          calendar={calendarQuery.data}
          isLoading={calendarQuery.isLoading}
          isError={calendarQuery.isError}
          errorMessage={toFriendlyMessage(calendarQuery.error, '예약 가능 날짜를 불러오지 못했습니다.')}
          onPickSlot={handlePickSlot}
        />

        <FamilyLinkPanel />
      </Flex>

      <CompleteBookingDialog
        intent={activeIntent}
        onClose={() => setActiveIntent(null)}
        onCompleted={handleCompleted}
      />
    </Box>
  );
}
