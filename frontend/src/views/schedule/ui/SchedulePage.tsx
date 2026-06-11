'use client';

import { useMemo, useState } from 'react';
import { Box, Callout, Card, Flex, Spinner, Text } from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useCounselorSchedule } from '@/entities/schedule';
import { useCounselorRecords } from '@/entities/consultation-record';
import { toFriendlyMessage } from '@/shared/api';
import { PageHeader } from '@/shared/ui';
import type { DateScope } from '@/shared/lib/date';
import type { CounselorRecordEntry } from '@/entities/consultation-record';
import type { StatusFilter } from '../types';
import { countByStatus, filterByScope, selectScheduleGroups } from '../lib/filter';
import { ScheduleToolbar } from './ScheduleToolbar';
import { ScheduleDayGroup } from './ScheduleDayGroup';

const SCOPE_EMPTY_LABEL: Record<DateScope, string> = {
  today: '오늘 예정된 상담이 없습니다.',
  upcoming: '예정된 상담이 없습니다.',
  past: '지난 상담 내역이 없습니다.',
  all: '예약된 상담이 없습니다.',
};

export default function SchedulePage() {
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [scope, setScope] = useState<DateScope>('today');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const scheduleQuery = useCounselorSchedule();
  const recordsQuery = useCounselorRecords();

  const entries = useMemo(() => scheduleQuery.data ?? [], [scheduleQuery.data]);

  // Status counts respect the active date scope, so the filter badges always
  // describe what a click would actually reveal.
  const statusCounts = useMemo(
    () => countByStatus(filterByScope(entries, scope)),
    [entries, scope],
  );

  const groups = useMemo(
    () => selectScheduleGroups(entries, scope, status),
    [entries, scope, status],
  );

  const pendingAll = useMemo(() => entries.filter((e) => !e.hasRecord).length, [entries]);

  const recordByBookingId = useMemo<Map<string, CounselorRecordEntry>>(() => {
    const map = new Map<string, CounselorRecordEntry>();
    for (const r of recordsQuery.data ?? []) map.set(r.bookingId, r);
    return map;
  }, [recordsQuery.data]);

  function handleToggle(bookingId: string) {
    setActiveBookingId((id) => (id === bookingId ? null : bookingId));
  }

  function handleRecorded() {
    setActiveBookingId(null);
  }

  const isLoading = scheduleQuery.isLoading || recordsQuery.isLoading;
  const visibleCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  let runningIndex = 0;

  return (
    <Box>
      <PageHeader
        eyebrow="상담사 콘솔"
        title="상담 일정"
        description={
          <>
            예약된 상담 {entries.length}건 · 기록 미작성{' '}
            <Text weight="bold">{pendingAll}건</Text>
          </>
        }
      />

      {!scheduleQuery.isError && entries.length > 0 && (
        <ScheduleToolbar
          scope={scope}
          onScopeChange={setScope}
          status={status}
          onStatusChange={setStatus}
          statusCounts={statusCounts}
        />
      )}

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}

      {scheduleQuery.isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{toFriendlyMessage(scheduleQuery.error, '일정을 불러오지 못했습니다.')}</Callout.Text>
        </Callout.Root>
      )}

      {!isLoading && !scheduleQuery.isError && visibleCount === 0 && (
        <Card size="4" className="text-center">
          <Text size="2" color="gray">
            {entries.length === 0 ? SCOPE_EMPTY_LABEL.all : SCOPE_EMPTY_LABEL[scope]}
          </Text>
        </Card>
      )}

      <Flex direction="column" gap="6">
        {groups.map((group) => {
          const node = (
            <ScheduleDayGroup
              key={group.dateKey}
              group={group}
              indexOffset={runningIndex}
              activeBookingId={activeBookingId}
              onToggle={handleToggle}
              onRecorded={handleRecorded}
              recordByBookingId={recordByBookingId}
            />
          );
          runningIndex += group.items.length;
          return node;
        })}
      </Flex>
    </Box>
  );
}
