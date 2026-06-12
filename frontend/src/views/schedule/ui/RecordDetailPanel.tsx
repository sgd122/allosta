import { Badge, Box, Button, Flex, Separator, Text } from '@radix-ui/themes';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { AiSummaryPanel, CONSULTATION_ACTION_LABELS } from '@/entities/consultation-record';
import type { CounselorRecordEntry } from '@/entities/consultation-record';
import { FieldLabel, RecordTextField } from '@/shared/ui';
import { OUTCOME_COLOR, OUTCOME_LABEL } from '../constants';

export function RecordDetailPanel({ record, onEdit }: { record: CounselorRecordEntry; onEdit: () => void }) {
  return (
    <Box pt="4">
      <Separator size="4" mb="4" />
      <Flex align="center" justify="between" gap="3" mb="4">
        <Flex align="center" gap="3">
          <Badge color={OUTCOME_COLOR[record.outcome]} size="2">
            {OUTCOME_LABEL[record.outcome]}
          </Badge>
          <Text size="1" color="gray">
            {new Date(record.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        </Flex>
        <Button size="1" variant="soft" color="gray" onClick={onEdit}>
          <Pencil1Icon /> 수정
        </Button>
      </Flex>

      {record.aiSummary && (
        <Box mb="4">
          <AiSummaryPanel summary={record.aiSummary} />
        </Box>
      )}

      <RecordTextField label="주요 상담 내용" value={record.summary} mb="4" />
      <RecordTextField label="권고 사항" value={record.recommendation} mb="4" />
      <RecordTextField label="후속 조치" value={record.followUp} mb="4" />

      {record.actions.length > 0 && (
        <Box mb="4">
          <FieldLabel>상담 행위</FieldLabel>
          <Flex wrap="wrap" gap="2">
            {record.actions.map((action) => (
              <Badge key={action} variant="soft" color="teal" size="1">
                {CONSULTATION_ACTION_LABELS[action]}
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      {record.products.length > 0 && (
        <Box mb="4">
          <FieldLabel>관심 상품</FieldLabel>
          <Flex wrap="wrap" gap="2">
            {record.products.map((p) => (
              <Badge key={p.productId} variant="soft" color="teal" size="1">
                <Text size="1" color="gray">{p.category} · </Text>{p.name}
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      {record.metrics.length > 0 && (
        <Box>
          <FieldLabel>연계 지표</FieldLabel>
          <Flex wrap="wrap" gap="2">
            {record.metrics.map((m, i) => (
              <Badge
                key={`${m.testResultId}-${m.metricKey}-${i}`}
                variant="soft"
                color="gray"
                size="1"
                className="font-mono text-[12px]"
              >
                {m.metricKey}
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      {record.products.length === 0 && record.metrics.length === 0 && !record.summary && (
        <Text size="2" color="gray">기록 내용이 없습니다.</Text>
      )}
    </Box>
  );
}
