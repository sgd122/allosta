import { useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Spinner,
  Table,
  Text,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useAdminRecords } from '@/entities/analytics';
import type { RecordListItem } from '@/entities/analytics';
import { toFriendlyMessage } from '@/shared/api';
import { OUTCOME_COLOR, OUTCOME_KO } from '../constants';
import { subjectTypeLabel } from './subject-label';

export function RecordsList({ onDrilldown }: { onDrilldown: (recordId: string) => void }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useAdminRecords(page);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <Card size="3" className="rise" style={{ animationDelay: '240ms' }}>
      <Flex align="center" justify="between" mb="4" wrap="wrap" gap="2">
        <Heading size="4" className="font-serif font-medium">
          상담 기록 목록
        </Heading>
        <Text size="1" color="gray">행 클릭 → 상세 조회</Text>
      </Flex>

      {isLoading && (
        <Flex justify="center" py="6">
          <Spinner size="3" />
        </Flex>
      )}
      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{toFriendlyMessage(error, '기록 목록을 불러오지 못했습니다.')}</Callout.Text>
        </Callout.Root>
      )}

      {data && (
        <>
          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>일시</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>고객</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>상담사</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>대상</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>결과</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.data.map((row: RecordListItem) => (
                <Table.Row
                  key={row.recordId}
                  className="cursor-pointer"
                  onClick={() => onDrilldown(row.recordId)}
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDrilldown(row.recordId);
                    }
                  }}
                  aria-label={`${row.customerName} 상담 상세 보기`}
                >
                  <Table.Cell>
                    <Text size="2" color="gray">
                      {new Date(row.slotStartAt).toLocaleDateString('ko-KR')}
                    </Text>
                  </Table.Cell>
                  <Table.Cell><Text size="2">{row.customerName}</Text></Table.Cell>
                  <Table.Cell><Text size="2">{row.counselorName}</Text></Table.Cell>
                  <Table.Cell>
                    <Text size="2" color="gray">{subjectTypeLabel(row.subjectType)}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={OUTCOME_COLOR[row.outcome]} size="1">
                      {OUTCOME_KO[row.outcome]}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          {totalPages > 1 && (
            <Flex align="center" gap="3" justify="center" mt="4">
              <Button
                variant="soft"
                size="2"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="이전 페이지"
              >
                ←
              </Button>
              <Text size="2" color="gray">{page} / {totalPages}</Text>
              <Button
                variant="soft"
                size="2"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="다음 페이지"
              >
                →
              </Button>
            </Flex>
          )}
        </>
      )}
    </Card>
  );
}
