'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Code,
  Flex,
  Heading,
  IconButton,
  Separator,
  Text,
  TextField,
} from '@radix-ui/themes';
import { CheckIcon, Cross2Icon, InfoCircledIcon, Pencil1Icon } from '@radix-ui/react-icons';
import {
  useFamilyLinks,
  useCreateInviteCodeMutation,
  useAcceptInviteCodeMutation,
  useRevokeFamilyLinkMutation,
  useSetFamilyLinkRelationMutation,
} from '@/entities/family-link';
import type { InviteCode } from '@/entities/family-link';
import { toFriendlyMessage } from '@/shared/api';
import { Eyebrow } from '@/shared/ui';
import { STATUS_LABEL, STATUS_COLOR } from '../constants';

/**
 * Secondary panel for symmetric account linking (no guardian/family hierarchy).
 * Any party generates an invite code; the other accepts it; each side can set
 * their own free-form relation label for the linked account.
 */
export function FamilyLinkPanel() {
  const [acceptCode, setAcceptCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<InviteCode | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [relationDraft, setRelationDraft] = useState('');

  const linksQuery = useFamilyLinks();

  const inviteMutation = useCreateInviteCodeMutation();

  const acceptMutation = useAcceptInviteCodeMutation();

  const revokeMutation = useRevokeFamilyLinkMutation();

  const relationMutation = useSetFamilyLinkRelationMutation();

  const links = linksQuery.data ?? [];

  function startEditing(linkId: string, current: string | null) {
    setEditingLinkId(linkId);
    setRelationDraft(current ?? '');
  }

  return (
    <Card className="rise w-full max-w-[340px] shrink-0" size="3">
      <Flex direction="column" gap="4">
        <Box>
          <Eyebrow className="mb-1 tracking-[0.1em]">계정 연동</Eyebrow>
          <Heading
            as="h2"
            size="3"
            className="font-serif font-medium"
          >
            검사 결과 공유
          </Heading>
          <Text size="1" color="gray" mt="1" as="p">
            다른 사용자와 연동하면 예약 시 서로의 검사 결과를 선택할 수 있습니다.
          </Text>
        </Box>

        {/* Top-level invite code button — any party can generate */}
        <Button
          variant="soft"
          color="teal"
          size="2"
          onClick={() =>
            inviteMutation.mutate(undefined, {
              onSuccess: (data) => setGeneratedCode(data),
            })
          }
          disabled={inviteMutation.isPending}
        >
          내 초대코드 발급
        </Button>

        {generatedCode && (
          <Callout.Root color="teal">
            <Callout.Icon><InfoCircledIcon /></Callout.Icon>
            <Callout.Text>
              <Text size="1" weight="bold" className="block mb-1">
                초대 코드 (상대에게 전달하세요)
              </Text>
              <Code size="2" className="break-all font-mono">{generatedCode.code}</Code>
              <Text size="1" color="gray" className="block mt-1">
                만료: {new Date(generatedCode.expiresAt).toLocaleString('ko-KR')}
              </Text>
            </Callout.Text>
          </Callout.Root>
        )}

        {links.length > 0 && (
          <Flex direction="column" gap="2">
            {links.map((link) => {
              const isAccepted = link.status === 'ACCEPTED';
              const isPending = link.status === 'PENDING';
              const displayName = isPending ? '초대 수락 대기 중' : link.counterpart.name;
              const isEditing = editingLinkId === link.id;
              return (
                <Card key={link.id} size="1" variant="surface">
                  <Flex align="center" justify="between" gap="2">
                    <Box className="min-w-0">
                      <Text
                        size="2"
                        weight="medium"
                        className={isPending ? 'text-gray-10' : undefined}
                      >
                        {displayName}
                      </Text>
                      <Flex align="center" gap="2" mt="1">
                        <Badge size="1" color={STATUS_COLOR[link.status]} variant="soft">
                          {STATUS_LABEL[link.status]}
                        </Badge>
                        {/* User-set relation label — only meaningful once linked */}
                        {isAccepted && !isEditing && (
                          link.relationLabel ? (
                            <Flex align="center" gap="1">
                              <Badge size="1" color="gray" variant="soft">{link.relationLabel}</Badge>
                              <IconButton
                                size="1"
                                variant="ghost"
                                color="gray"
                                aria-label="관계 수정"
                                onClick={() => startEditing(link.id, link.relationLabel)}
                              >
                                <Pencil1Icon width="12" height="12" />
                              </IconButton>
                            </Flex>
                          ) : (
                            <Button
                              size="1"
                              variant="ghost"
                              color="gray"
                              onClick={() => startEditing(link.id, null)}
                            >
                              + 관계 설정
                            </Button>
                          )
                        )}
                      </Flex>
                    </Box>
                    <Button
                      size="1"
                      variant="soft"
                      color="red"
                      onClick={() => revokeMutation.mutate(link.id)}
                      disabled={revokeMutation.isPending}
                      aria-label={`${displayName} 연동 해제`}
                    >
                      <Cross2Icon />
                    </Button>
                  </Flex>

                  {/* Inline relation editor */}
                  {isAccepted && isEditing && (
                    <Box mt="2">
                      <Flex gap="2">
                        <TextField.Root
                          autoFocus
                          placeholder="예) 엄마, 배우자, 트레이너"
                          value={relationDraft}
                          maxLength={20}
                          onChange={(e) => setRelationDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              relationMutation.mutate(
                                { linkId: link.id, relation: relationDraft },
                                {
                                  onSuccess: () => {
                                    setEditingLinkId(null);
                                    setRelationDraft('');
                                  },
                                },
                              );
                            } else if (e.key === 'Escape') {
                              setEditingLinkId(null);
                            }
                          }}
                          className="flex-1"
                          aria-label="관계 라벨 입력"
                        />
                        <IconButton
                          size="2"
                          color="teal"
                          aria-label="관계 저장"
                          disabled={relationMutation.isPending}
                          onClick={() =>
                            relationMutation.mutate(
                              { linkId: link.id, relation: relationDraft },
                              {
                                onSuccess: () => {
                                  setEditingLinkId(null);
                                  setRelationDraft('');
                                },
                              },
                            )
                          }
                        >
                          <CheckIcon />
                        </IconButton>
                        <IconButton
                          size="2"
                          variant="soft"
                          color="gray"
                          aria-label="취소"
                          onClick={() => setEditingLinkId(null)}
                        >
                          <Cross2Icon />
                        </IconButton>
                      </Flex>
                      <Text size="1" color="gray" mt="1" as="p">
                        이 사람이 나에게 어떤 사람인지 자유롭게 적어 주세요. 비우면 삭제됩니다.
                      </Text>
                    </Box>
                  )}
                </Card>
              );
            })}
          </Flex>
        )}

        <Separator size="4" />

        <Box>
          <Text size="2" weight="medium" mb="2" className="block">초대 코드 수락</Text>
          <Flex gap="2">
            <TextField.Root
              placeholder="상대에게 받은 초대 코드"
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value)}
              className="flex-1 font-mono"
              aria-label="초대 코드 입력"
            />
            <Button
              variant="solid"
              color="teal"
              onClick={() =>
                acceptMutation.mutate(acceptCode.trim(), {
                  onSuccess: () => setAcceptCode(''),
                })
              }
              disabled={!acceptCode.trim() || acceptMutation.isPending}
            >
              수락
            </Button>
          </Flex>
          {acceptMutation.isError && (
            <Text size="1" color="red" mt="1" className="block">
              {toFriendlyMessage(acceptMutation.error, '유효하지 않은 코드입니다.')}
            </Text>
          )}
          {acceptMutation.isSuccess && (
            <Text size="1" color="teal" mt="1" className="block">
              연동이 완료되었습니다.
            </Text>
          )}
        </Box>
      </Flex>
    </Card>
  );
}
