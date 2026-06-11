import {
  Badge,
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  Separator,
  Spinner,
  Text,
} from '@radix-ui/themes';
import { Cross2Icon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useDrilldown } from '@/entities/analytics';
import { toFriendlyMessage } from '@/shared/api';
import { Eyebrow, FieldLabel, RecordTextField } from '@/shared/ui';
import { CONSULTATION_ACTION_LABELS } from '@/entities/consultation-record';
import { formatMetricKey } from '@/entities/test-result';
import { OUTCOME_COLOR, OUTCOME_KO } from '../constants';
import { subjectTypeLabel } from './subject-label';

export function DrilldownDialog({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useDrilldown(recordId);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content style={{ maxWidth: 480 }} aria-label="상담 기록 상세">
        <Flex align="center" justify="between" mb="4">
          <Box>
            <Eyebrow className="mb-1 tracking-[0.12em]">상담 기록 상세</Eyebrow>
            <Dialog.Title className="font-serif font-medium">
              기록 상세 조회
            </Dialog.Title>
          </Box>
          <Dialog.Close>
            <Button variant="ghost" color="gray" size="2" aria-label="닫기">
              <Cross2Icon />
            </Button>
          </Dialog.Close>
        </Flex>

        {isLoading && (
          <Flex justify="center" py="6">
            <Spinner size="3" />
          </Flex>
        )}
        {isError && (
          <Callout.Root color="red">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{toFriendlyMessage(error, '상세 정보를 불러오지 못했습니다.')}</Callout.Text>
          </Callout.Root>
        )}

        {data && (
          <Flex direction="column" gap="4">
            <Flex align="center" gap="3">
              <Badge color={OUTCOME_COLOR[data.outcome]} size="2">
                {OUTCOME_KO[data.outcome]}
              </Badge>
              <Text size="1" color="gray">
                {new Date(data.slotStartAt).toLocaleString('ko-KR')}
              </Text>
            </Flex>

            <Separator size="4" />

            <Flex direction="column" gap="3">
              <Flex gap="4">
                <Box className="min-w-[80px]">
                  <Text size="1" weight="bold" color="gray" className="mb-0.5 block">고객</Text>
                  <Text size="2">{data.customerName}</Text>
                </Box>
                <Box>
                  <Text size="1" weight="bold" color="gray" className="mb-0.5 block">상담사</Text>
                  <Text size="2">{data.counselorName}</Text>
                </Box>
                <Box>
                  <Text size="1" weight="bold" color="gray" className="mb-0.5 block">대상</Text>
                  <Text size="2">{subjectTypeLabel(data.subjectType)}</Text>
                </Box>
              </Flex>
            </Flex>

            <RecordTextField label="주요 상담 내용" value={data.summary} />
            <RecordTextField label="권고 사항" value={data.recommendation} />
            <RecordTextField label="후속 조치" value={data.followUp} />

            {data.actions.length > 0 && (
              <Box>
                <FieldLabel>상담 행위</FieldLabel>
                <Flex wrap="wrap" gap="2">
                  {data.actions.map((action) => (
                    <Badge key={action} variant="soft" color="teal" size="1">
                      {CONSULTATION_ACTION_LABELS[action]}
                    </Badge>
                  ))}
                </Flex>
              </Box>
            )}

            {data.products.length > 0 && (
              <Box>
                <FieldLabel>관심 상품</FieldLabel>
                <Flex wrap="wrap" gap="2">
                  {data.products.map((name) => (
                    <Badge key={name} variant="soft" color="teal" size="1">{name}</Badge>
                  ))}
                </Flex>
              </Box>
            )}

            {data.metricKeys.length > 0 && (
              <Box>
                <FieldLabel>연계 지표</FieldLabel>
                <Flex wrap="wrap" gap="2">
                  {data.metricKeys.map((k) => (
                    <Badge key={k} variant="soft" color="gray" size="1">
                      {formatMetricKey(k)}
                    </Badge>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
