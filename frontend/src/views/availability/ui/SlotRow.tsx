import { useState } from 'react';
import { Badge, Box, Button, Callout, Card, Flex, Spinner, Text } from '@radix-ui/themes';
import {
  CheckCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import {
  useUpdateCounselorSlotMutation,
  useDeleteCounselorSlotMutation,
} from '@/entities/availability';
import type { AvailabilitySlot } from '@/entities/availability';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay, formatTime } from '@/shared/lib/format';

export function SlotRow({ slot, index }: { slot: AvailabilitySlot; index: number }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleMutation = useUpdateCounselorSlotMutation();
  const deleteMutation = useDeleteCounselorSlotMutation();

  const isPast = new Date(slot.endAt) < new Date();

  return (
    <Card
      size="3"
      className="rise"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Flex align="center" justify="between" gap="4" wrap="wrap">
        <Flex align="center" gap="4" className="min-w-0 flex-1">
          <Box className="shrink-0">
            <Text
              size="1"
              color="gray"
              className="mb-0.5 block font-semibold uppercase tracking-[0.05em]"
            >
              {formatDay(slot.startAt)}
            </Text>
            <Text size="3" className="font-mono font-medium">
              {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
            </Text>
          </Box>

          <Flex gap="2" align="center">
            {isPast ? (
              <Badge color="gray" variant="soft" size="1">지난 슬롯</Badge>
            ) : slot.isOpen ? (
              <Badge color="teal" variant="soft" size="1">예약 가능</Badge>
            ) : (
              <Badge color="gray" variant="soft" size="1">비공개</Badge>
            )}
          </Flex>
        </Flex>

        {!isPast && (
          <Flex gap="2" align="center" className="shrink-0">
            {!confirmDelete ? (
              <>
                <Button
                  size="2"
                  variant="soft"
                  color={slot.isOpen ? 'gray' : 'teal'}
                  disabled={toggleMutation.isPending}
                  onClick={() =>
                    toggleMutation.mutate({ slotId: slot.id, dto: { isOpen: !slot.isOpen } })
                  }
                >
                  {toggleMutation.isPending ? <Spinner size="1" /> : <CheckCircledIcon />}
                  {slot.isOpen ? '비공개로 전환' : '예약 가능으로 전환'}
                </Button>
                <Button
                  size="2"
                  variant="soft"
                  color="red"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon />
                  삭제
                </Button>
              </>
            ) : (
              <>
                <Text size="2" weight="medium">정말 삭제하시겠어요?</Text>
                <Button
                  size="2"
                  variant="soft"
                  color="gray"
                  disabled={deleteMutation.isPending}
                  onClick={() => setConfirmDelete(false)}
                >
                  <Cross2Icon /> 취소
                </Button>
                <Button
                  size="2"
                  color="red"
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate(slot.id, {
                      onSuccess: () => setConfirmDelete(false),
                    })
                  }
                >
                  {deleteMutation.isPending ? <Spinner size="1" /> : <TrashIcon />}
                  확인 삭제
                </Button>
              </>
            )}
          </Flex>
        )}
      </Flex>

      {(toggleMutation.isError || deleteMutation.isError) && (
        <Callout.Root color="red" size="1" mt="2">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>
            {toFriendlyMessage(
              toggleMutation.error ?? deleteMutation.error,
              '처리에 실패했습니다.',
            )}
          </Callout.Text>
        </Callout.Root>
      )}
    </Card>
  );
}
