import { useState } from 'react';
import { Box, Button, Callout, Card, Flex, Spinner, Text, TextField } from '@radix-ui/themes';
import { Cross2Icon, ExclamationTriangleIcon, PlusIcon } from '@radix-ui/react-icons';
import { useCreateCounselorSlotsMutation } from '@/entities/availability';
import { toFriendlyMessage } from '@/shared/api';
import { Eyebrow } from '@/shared/ui';

export function CreateSlotForm({ onClose }: { onClose: () => void }) {
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const createMutation = useCreateCounselorSlotsMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startAt || !endAt) return;
    createMutation.mutate(
      [{ startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() }],
      { onSuccess: onClose },
    );
  }

  return (
    <Card size="3" className="border border-teal-4 bg-teal-2">
      <Eyebrow className="mb-3 tracking-[0.12em]">새 슬롯 추가</Eyebrow>

      <form onSubmit={handleSubmit}>
        <Flex gap="4" direction={{ initial: 'column', sm: 'row' }} align="end">
          <Box className="flex-1">
            <Text size="1" weight="bold" color="gray" className="mb-1.5 block">
              시작 일시
            </Text>
            <TextField.Root
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
            />
          </Box>
          <Box className="flex-1">
            <Text size="1" weight="bold" color="gray" className="mb-1.5 block">
              종료 일시
            </Text>
            <TextField.Root
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
            />
          </Box>
          <Flex gap="2">
            <Button
              type="submit"
              color="teal"
              size="2"
              disabled={createMutation.isPending || !startAt || !endAt}
            >
              {createMutation.isPending ? <Spinner size="1" /> : <PlusIcon />}
              추가
            </Button>
            <Button
              type="button"
              variant="soft"
              color="gray"
              size="2"
              disabled={createMutation.isPending}
              onClick={onClose}
            >
              <Cross2Icon /> 취소
            </Button>
          </Flex>
        </Flex>

        {createMutation.isError && (
          <Callout.Root color="red" size="1" mt="3">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>
              {toFriendlyMessage(createMutation.error, '슬롯 추가에 실패했습니다.')}
            </Callout.Text>
          </Callout.Root>
        )}
      </form>
    </Card>
  );
}
