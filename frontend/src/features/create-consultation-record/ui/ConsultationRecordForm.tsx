'use client';

import { useState, type FormEvent } from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Spinner,
  Text,
  TextArea,
} from '@radix-ui/themes';
import {
  ActivityLogIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  Pencil1Icon,
  RocketIcon,
  TargetIcon,
} from '@radix-ui/react-icons';
import {
  useSaveConsultationRecordMutation,
  CONSULTATION_ACTION_LABELS,
} from '@/entities/consultation-record';
import type {
  ConsultationActionType,
  ConsultationRecordInput,
} from '@/entities/consultation-record';
import { useProducts } from '@/entities/product';
import { useChallenges } from '@/entities/challenge';
import { useBookingTestResults } from '@/entities/test-result';
import type { Outcome } from '@/shared/config';
import { toFriendlyMessage } from '@/shared/api';
import {
  buildConsultationRecordInput,
  createRecordDraft,
  toggleDraftValue,
} from '../model/draft';
import type { Props } from '../types';
import { CONSULTATION_ACTION_ORDER, NO_CHALLENGE } from '../constants';
import { ToggleChip } from './ToggleChip';
import { SectionLabel } from './SectionLabel';
import { OutcomeSelector } from './OutcomeSelector';
import { ProductMultiselect } from './ProductMultiselect';
import { MetricCheckboxes } from './MetricCheckboxes';
import { ChallengeSelect } from './ChallengeSelect';

export function ConsultationRecordForm({
  bookingId,
  onSuccess,
  mode = 'create',
  recordId,
  initial,
  onCancel,
}: Props) {
  const isEdit = mode === 'edit';
  const initialDraft = createRecordDraft({
    summary: initial?.summary ?? '',
    recommendation: initial?.recommendation ?? '',
    followUp: initial?.followUp ?? null,
    actions: initial?.actions ?? [],
    outcome: initial?.outcome ?? 'EXPLAINED',
    productIds: initial?.productIds ?? [],
    metricRefs: initial?.metricRefs ?? [],
  });
  const [summary, setSummary] = useState(initialDraft.summary);
  const [recommendation, setRecommendation] = useState(initialDraft.recommendation);
  const [followUp, setFollowUp] = useState(initialDraft.followUp ?? '');
  const [selectedActions, setSelectedActions] = useState<Set<ConsultationActionType>>(
    () => initialDraft.actions,
  );
  const [outcome, setOutcome] = useState<Outcome>(initialDraft.outcome);
  // Challenge enrollment is create-only (never on edit); NO_CHALLENGE = not enrolling.
  const [challengeId, setChallengeId] = useState<string>(NO_CHALLENGE);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => initialDraft.productIds,
  );
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    () => initialDraft.metricRefs,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const productsQuery = useProducts();
  const testResultsQuery = useBookingTestResults(bookingId);
  // Challenge catalog is only needed for create-mode enrollment.
  const challengesQuery = useChallenges(!isEdit);

  const mutation = useSaveConsultationRecordMutation(onSuccess);

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) => toggleDraftValue(prev, id));
  }

  function toggleMetric(encoded: string) {
    setSelectedMetrics((prev) => toggleDraftValue(prev, encoded));
  }

  function toggleAction(action: ConsultationActionType) {
    setSelectedActions((prev) => toggleDraftValue(prev, action));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input: ConsultationRecordInput = buildConsultationRecordInput(
      bookingId,
      {
        summary,
        recommendation,
        followUp,
        actions: selectedActions,
        outcome,
        productIds: selectedProductIds,
        metricRefs: selectedMetrics,
        // Enroll only on create when an actual challenge is selected (UX: PURCHASED path).
        challengeId: challengeId !== NO_CHALLENGE ? challengeId : undefined,
      },
      isEdit ? 'edit' : 'create',
    );
    mutation.mutate(
      { recordId: isEdit && recordId ? recordId : null, input },
      {
        onError: (err) =>
          setFormError(toFriendlyMessage(err, '상담 기록을 저장하지 못했습니다.')),
      },
    );
  }

  const canSave =
    summary.trim().length > 0 &&
    recommendation.trim().length > 0 &&
    !mutation.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="6">
        <Box>
          <SectionLabel
            icon={<Pencil1Icon />}
            title="주요 상담 내용"
            required
            hint="고객의 호소·문의와 설명한 내용을 요약해 주세요."
          />
          <TextArea
            id={`summary-${bookingId}`}
            rows={4}
            placeholder="예) 비타민D 수치가 낮은 점을 설명하고 검사 결과를 안내함."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-label="주요 상담 내용"
          />
        </Box>

        <Box>
          <SectionLabel
            icon={<Pencil1Icon />}
            title="권고 사항"
            required
            hint="식품·영양제·생활습관에 대한 권고 사항을 적어 주세요."
          />
          <TextArea
            id={`recommendation-${bookingId}`}
            rows={3}
            placeholder="예) 종합비타민을 권고하고 등푸른 생선 섭취를 안내함."
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            aria-label="권고 사항"
          />
        </Box>

        <Box>
          <SectionLabel
            icon={<Pencil1Icon />}
            title="후속 조치"
            hint="재검사 시기, 다음 단계 등을 적어 주세요 (선택)."
          />
          <TextArea
            id={`followup-${bookingId}`}
            rows={2}
            placeholder="예) 3개월 뒤 재검사 권유."
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            aria-label="후속 조치"
          />
        </Box>

        <Box>
          <SectionLabel
            icon={<ActivityLogIcon />}
            title="상담 행위 체크리스트"
            hint="이번 상담에서 수행한 행위를 선택하세요 (선택)."
            trailing={
              selectedActions.size > 0 ? (
                <Badge color="teal" variant="soft" size="1">{selectedActions.size}개 선택</Badge>
              ) : undefined
            }
          />
          <Flex gap="2" wrap="wrap">
            {CONSULTATION_ACTION_ORDER.map((action) => {
              const checked = selectedActions.has(action);
              return (
                <ToggleChip key={action} checked={checked} onClick={() => toggleAction(action)}>
                  <Text size="2" weight={checked ? 'medium' : 'regular'}>
                    {CONSULTATION_ACTION_LABELS[action]}
                  </Text>
                </ToggleChip>
              );
            })}
          </Flex>
        </Box>

        <Box>
          <SectionLabel icon={<CheckIcon />} title="상담 결과" hint="이번 상담의 결과를 하나 선택하세요." />
          <OutcomeSelector value={outcome} onChange={setOutcome} />
        </Box>

        {/* Challenge enrollment surfaces only on the create + PURCHASED path. */}
        {!isEdit && outcome === 'PURCHASED' && (
          <Box>
            <SectionLabel
              icon={<RocketIcon />}
              title="챌린지 등록"
              hint="구매 고객을 챌린지에 등록할 수 있습니다 (선택)."
              trailing={challengesQuery.isLoading ? <Spinner size="1" /> : undefined}
            />
            {challengesQuery.isError && (
              <Text size="2" color="gray">챌린지 목록을 불러오지 못했습니다.</Text>
            )}
            {challengesQuery.data && (
              <ChallengeSelect
                challenges={challengesQuery.data}
                value={challengeId}
                onChange={setChallengeId}
              />
            )}
          </Box>
        )}

        <Box>
          <SectionLabel
            icon={<TargetIcon />}
            title="관심 상품"
            hint="상담에서 고객이 관심을 보인 제품을 선택하세요 (선택)."
            trailing={
              productsQuery.isLoading ? (
                <Spinner size="1" />
              ) : selectedProductIds.size > 0 ? (
                <Badge color="teal" variant="soft" size="1">{selectedProductIds.size}개 선택</Badge>
              ) : undefined
            }
          />
          {productsQuery.isError && (
            <Text size="2" color="gray">상품 목록을 불러오지 못했습니다.</Text>
          )}
          {productsQuery.data && (
            <ProductMultiselect
              products={productsQuery.data}
              selected={selectedProductIds}
              onToggle={toggleProduct}
            />
          )}
        </Box>

        <Box>
          <SectionLabel
            icon={<ActivityLogIcon />}
            title="검사 결과 · 연계 지표"
            hint="상담에서 언급한 지표를 선택하면 기록에 연계됩니다 (선택)."
            trailing={
              testResultsQuery.isLoading ? (
                <Spinner size="1" />
              ) : selectedMetrics.size > 0 ? (
                <Badge color="teal" variant="soft" size="1">{selectedMetrics.size}개 연계</Badge>
              ) : undefined
            }
          />
          {testResultsQuery.isError && (
            <Text size="2" color="gray">검사 결과를 불러오지 못했습니다.</Text>
          )}
          {testResultsQuery.data && (
            <MetricCheckboxes
              testResults={testResultsQuery.data}
              selected={selectedMetrics}
              onToggle={toggleMetric}
            />
          )}
        </Box>

        {formError && (
          <Callout.Root color="red" role="alert">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{formError}</Callout.Text>
          </Callout.Root>
        )}

        <Box pt="2" className="border-t border-gray-4">
          <Flex gap="3" align="center" mt="4" wrap="wrap">
            <Button type="submit" size="3" disabled={!canSave} style={{ flex: isEdit ? undefined : '1 1 auto' }}>
              {mutation.isPending && <Spinner size="1" />}
              {mutation.isPending
                ? '저장 중…'
                : isEdit
                  ? '수정 저장'
                  : '상담 기록 저장'}
            </Button>
            {isEdit && onCancel && (
              <Button
                type="button"
                size="3"
                variant="soft"
                color="gray"
                disabled={mutation.isPending}
                onClick={onCancel}
              >
                취소
              </Button>
            )}
          </Flex>
          {!canSave && !mutation.isPending && (
            <Text size="1" color="gray" mt="2" as="p">
              주요 상담 내용과 권고 사항을 입력하면 저장할 수 있어요.
            </Text>
          )}
        </Box>
      </Flex>
    </form>
  );
}
