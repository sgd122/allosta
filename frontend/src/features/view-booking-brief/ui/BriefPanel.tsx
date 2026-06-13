'use client';

import { Badge, Box, Callout, Card, Flex, Link, Spinner, Text } from '@radix-ui/themes';
import {
  ChatBubbleIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  MobileIcon,
  PersonIcon,
} from '@radix-ui/react-icons';
import {
  countAbnormalIndicators,
  useBookingBrief,
} from '@/entities/consultation-brief';
import { toFriendlyMessage } from '@/shared/api';
import { formatDay } from '@/shared/lib/format';
import { Eyebrow, FieldLabel } from '@/shared/ui';
import { BRIEF_OUTCOME_LABEL } from '../constants';
import { BriefIndicatorTable } from './BriefIndicatorTable';
import { CallLogSection } from './CallLogSection';
import { GuidanceMarkdown } from './GuidanceMarkdown';

type Props = {
  bookingId: string;
  /** When false the brief GET is skipped, so briefOpenedAt is never stamped. */
  active: boolean;
};

/**
 * The counselor's read-only pre-consultation brief. Mounting with `active` true
 * triggers the GET, which the server uses to mark the booking opened (the
 * analytics brief-open-rate numerator). Surfaces, in order: the customer's
 * 사전 질문(concern), the AI 권장 진행 방향(pre-consultation guidance), interpreted
 * indicators (abnormal-first), past consultation records (newest first), and
 * ACCEPTED family context.
 */
export function BriefPanel({ bookingId, active }: Props) {
  const { data, isLoading, isError, error } = useBookingBrief(bookingId, active);

  if (isLoading) {
    return (
      <Flex justify="center" py="5">
        <Spinner size="2" />
      </Flex>
    );
  }

  if (isError) {
    return (
      <Callout.Root color="red" size="1">
        <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
        <Callout.Text>{toFriendlyMessage(error, '브리핑을 불러오지 못했습니다.')}</Callout.Text>
      </Callout.Root>
    );
  }

  if (!data) return null;

  const abnormalCount = countAbnormalIndicators(data.indicators);

  return (
    <Box>
      <Flex align="center" justify="between" gap="3" mb="4" wrap="wrap">
        <Eyebrow>사전 브리핑</Eyebrow>
        {abnormalCount > 0 ? (
          <Badge color="amber" variant="soft" size="1">
            주의 지표 {abnormalCount}건
          </Badge>
        ) : (
          <Badge color="teal" variant="soft" size="1">특이 지표 없음</Badge>
        )}
      </Flex>

      <Flex align="center" gap="2" mb="4">
        <MobileIcon className="text-gray-11 shrink-0" />
        <Link
          href={`tel:${data.phone.replace(/[^0-9+]/g, '')}`}
          size="2"
          className="font-mono"
          aria-label={`고객에게 전화하기: ${data.phone}`}
        >
          {data.phone}
        </Link>
      </Flex>

      {data.concern && (
        <Callout.Root color="teal" size="1" mb="4">
          <Callout.Icon><ChatBubbleIcon /></Callout.Icon>
          <Callout.Text>
            <Text weight="medium">고객 사전 질문 · </Text>
            {data.concern}
          </Callout.Text>
        </Callout.Root>
      )}

      {data.guidance && (
        <Card size="2" mb="4" className="border border-violet-5 bg-violet-2">
          <Flex align="center" justify="between" gap="2" mb="2" wrap="wrap">
            <Flex align="center" gap="2">
              <MagicWandIcon className="text-violet-11" />
              <Text size="2" weight="medium" className="text-violet-12">
                AI 권장 진행 방향
              </Text>
            </Flex>
            {data.guidance.status === 'UPGRADED' ? (
              <Badge color="violet" variant="soft" size="1">
                AI{data.guidance.model ? ` · ${data.guidance.model}` : ''}
              </Badge>
            ) : (
              <Badge color="gray" variant="soft" size="1">기본 가이드</Badge>
            )}
          </Flex>
          <GuidanceMarkdown content={data.guidance.content} />
        </Card>
      )}

      <Box mb="4">
        <FieldLabel>검사 지표</FieldLabel>
        <BriefIndicatorTable indicators={data.indicators} />
      </Box>

      {data.family.length > 0 && (
        <Box mb="4">
          <FieldLabel>가족 맥락 (연동·동의 완료)</FieldLabel>
          <Flex wrap="wrap" gap="2">
            {data.family.map((member) => (
              <Badge key={member.customerId} variant="soft" color="violet" size="1">
                <PersonIcon /> {member.name}
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      <Box>
        <FieldLabel>과거 상담 기록</FieldLabel>
        {data.pastRecords.length === 0 ? (
          <Text size="2" color="gray">과거 상담 기록이 없습니다.</Text>
        ) : (
          <Flex direction="column" gap="3">
            {data.pastRecords.map((record) => (
              <Box key={record.id} className="rounded-2 border border-gray-4 p-3">
                <Flex align="center" gap="2" mb="2" wrap="wrap">
                  <Badge variant="soft" color="gray" size="1">
                    {BRIEF_OUTCOME_LABEL[record.outcome]}
                  </Badge>
                  <Text size="1" color="gray">{formatDay(record.createdAt)}</Text>
                </Flex>
                <Text size="2" as="p" className="mb-1">{record.summary}</Text>
                {record.recommendation && (
                  <Text size="1" color="gray" as="p">권고 · {record.recommendation}</Text>
                )}
              </Box>
            ))}
          </Flex>
        )}
      </Box>

      <CallLogSection bookingId={bookingId} callLogs={data.callLogs} />
    </Box>
  );
}
