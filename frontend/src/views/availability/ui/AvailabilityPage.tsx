'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Callout, Card, Flex, Spinner, Text } from '@radix-ui/themes';
import { ExclamationTriangleIcon, PlusIcon } from '@radix-ui/react-icons';
import { useCounselorSlots } from '@/entities/availability';
import { toFriendlyMessage } from '@/shared/api';
import { PageHeader } from '@/shared/ui';
import type { DateScope } from '@/shared/lib/date';
import { selectSlotGroups } from '../lib/grouping';
import { SlotRow } from './SlotRow';
import { CreateSlotForm } from './CreateSlotForm';
import { AvailabilityToolbar } from './AvailabilityToolbar';
import { AvailabilityDayGroup } from './AvailabilityDayGroup';

const SCOPE_EMPTY_LABEL: Record<DateScope, string> = {
  today: '오늘 등록된 슬롯이 없습니다.',
  upcoming: '예정된 슬롯이 없습니다.',
  past: '지난 슬롯이 없습니다.',
  all: '등록된 슬롯이 없습니다. 위의 버튼으로 추가해 보세요.',
};

export default function AvailabilityPage() {
  const [showForm, setShowForm] = useState(false);
  const [scope, setScope] = useState<DateScope>('upcoming');

  const { data, isLoading, isError, error } = useCounselorSlots();

  const slots = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => selectSlotGroups(slots, scope), [slots, scope]);

  const openCount = useMemo(() => slots.filter((s) => s.isOpen).length, [slots]);
  const visibleCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  // A single dated group needs no header — render the rows flat for less chrome.
  const isSingleDay = groups.length === 1;
  let runningIndex = 0;

  return (
    <Box>
      <PageHeader
        eyebrow="상담사 콘솔"
        title="가용 일정 관리"
        description={`예약 가능 슬롯 ${openCount}개 · 전체 ${slots.length}개`}
        action={
          !showForm && (
            <Button color="teal" onClick={() => setShowForm(true)}>
              <PlusIcon /> 슬롯 추가
            </Button>
          )
        }
      />

      {showForm && (
        <Box mb="4">
          <CreateSlotForm onClose={() => setShowForm(false)} />
        </Box>
      )}

      {!isError && slots.length > 0 && (
        <AvailabilityToolbar scope={scope} onScopeChange={setScope} />
      )}

      {isLoading && (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      )}

      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>
            {toFriendlyMessage(error, '슬롯 목록을 불러오지 못했습니다.')}
          </Callout.Text>
        </Callout.Root>
      )}

      {!isLoading && !isError && visibleCount === 0 && (
        <Card size="4" className="text-center">
          <Text size="2" color="gray">
            {slots.length === 0 ? SCOPE_EMPTY_LABEL.all : SCOPE_EMPTY_LABEL[scope]}
          </Text>
        </Card>
      )}

      {isSingleDay ? (
        <Flex direction="column" gap="3">
          {groups[0].items.map((slot, i) => (
            <SlotRow key={slot.id} slot={slot} index={i} />
          ))}
        </Flex>
      ) : (
        <Flex direction="column" gap="6">
          {groups.map((group) => {
            const node = (
              <AvailabilityDayGroup
                key={group.dateKey}
                group={group}
                indexOffset={runningIndex}
              />
            );
            runningIndex += group.items.length;
            return node;
          })}
        </Flex>
      )}
    </Box>
  );
}
