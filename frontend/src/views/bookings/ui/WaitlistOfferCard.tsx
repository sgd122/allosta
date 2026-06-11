import { Box, Button, Card, Flex, Separator, Text } from '@radix-ui/themes';
import { BellIcon } from '@radix-ui/react-icons';
import type { MyWaitlistEntry } from '@/entities/waitlist';
import { formatDay, formatTime } from '@/shared/lib/format';

type OfferedEntry = MyWaitlistEntry & { offeredSlot: NonNullable<MyWaitlistEntry['offeredSlot']> };

export function WaitlistOfferCard({
  entry,
  onBookOffer,
}: {
  entry: MyWaitlistEntry;
  onBookOffer: (entry: OfferedEntry) => void;
}) {
  const slot = entry.offeredSlot;
  if (!slot) return null;

  const expiresAt = entry.offerExpiresAt ? new Date(entry.offerExpiresAt) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return (
    <Card
      size="3"
      className="bg-amber-2 border border-amber-6"
    >
      <Flex align="center" gap="3" mb="3">
        <BellIcon className="text-amber-11 shrink-0" />
        <Box>
          <Text size="2" weight="bold" className="text-amber-11 block">
            대기 순번이 되었습니다
          </Text>
          <Text size="1" color="gray">
            슬롯이 열렸습니다. 예약 만료 전에 확정하세요.
          </Text>
        </Box>
      </Flex>

      <Separator size="4" mb="3" />

      <Flex align="center" justify="between" gap="4" wrap="wrap">
        <Box>
          <Text
            size="1"
            color="gray"
            className="font-semibold uppercase tracking-[0.05em] block"
          >
            {formatDay(slot.startAt)}
          </Text>
          <Text size="3" className="font-mono font-medium">
            {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
          </Text>
          {expiresAt && (
            <Text size="1" color={isExpired ? 'red' : 'amber'} mt="1" as="p">
              {isExpired
                ? '오퍼가 만료되었습니다.'
                : `만료: ${expiresAt.toLocaleString('ko-KR')}`}
            </Text>
          )}
        </Box>

        {!isExpired && (
          <Button
            color="amber"
            size="2"
            onClick={() => onBookOffer(entry as OfferedEntry)}
          >
            예약하기
          </Button>
        )}
      </Flex>
    </Card>
  );
}
