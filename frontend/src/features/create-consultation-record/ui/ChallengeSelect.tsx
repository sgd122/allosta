import { Select } from '@radix-ui/themes';
import type { ChallengeSelectProps } from '../types';
import { NO_CHALLENGE } from '../constants';

export function ChallengeSelect({ challenges, value, onChange }: ChallengeSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger placeholder="챌린지를 선택하세요 (선택)" aria-label="챌린지 등록" />
      <Select.Content>
        <Select.Item value={NO_CHALLENGE}>등록 안 함</Select.Item>
        {challenges.map((challenge) => (
          <Select.Item key={challenge.id} value={challenge.id}>
            {challenge.category} · {challenge.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
