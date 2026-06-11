'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import type { LoginResponse } from '@/entities/session';
import { DEMO_ACCOUNTS, ROLE_HOME } from '../constants';
import type { DemoAccount } from '../types';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? '이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const data = (await res.json()) as LoginResponse;
      // Client navigation keeps the QueryClient alive across the login, so any
      // data cached under the previous session (currentUser role, bookings,
      // schedule, …) would persist. Clear it so the new user starts fresh.
      queryClient.clear();
      router.push(ROLE_HOME[data.role] ?? '/');
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  }

  return (
    <div className="login-screen">
      <aside className="login-aside" aria-hidden="true">
        <div className="login-aside-inner">
          <Text size="1" className="font-mono tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Allosta Platform
          </Text>
          <Heading
            as="h1"
            mt="4"
            className="font-serif font-medium leading-[1.06] tracking-[-0.015em] text-white"
            style={{ fontSize: 'clamp(2.2rem, 1.4rem + 2.6vw, 3.4rem)' }}
          >
            건강한 변화는
            <br />
            <em className="italic" style={{ color: '#ffd9b8' }}>대화</em>에서
            <br />
            시작됩니다.
          </Heading>
          <Text
            mt="4"
            as="p"
            size="2"
            className="leading-[1.6]"
            style={{ color: 'rgba(255,255,255,0.75)', maxWidth: '30ch' }}
          >
            전문 상담사와 함께 건강 목표를 향해 나아가세요.
          </Text>
        </div>
        <div className="login-orbit">
          <div className="orbit-ring" />
          <div className="orbit-ring orbit-ring-2" />
          <div className="orbit-core" />
        </div>
      </aside>

      <div className="login-panel">
        <Box className="w-full max-w-[400px]">
          <Text
            size="1"
            className="font-mono tracking-[0.15em] uppercase font-semibold text-teal-11"
          >
            Allosta
          </Text>

          <Heading as="h2" size="5" mt="3" mb="1">
            로그인
          </Heading>
          <Text size="2" color="gray">
            계정에 로그인하여 서비스를 이용하세요.
          </Text>

          <form onSubmit={handleSubmit} noValidate>
            <Flex direction="column" gap="4" mt="5">
              <Box>
                <Text as="label" htmlFor="email" size="2" weight="medium" mb="1" className="block">
                  이메일
                </Text>
                <TextField.Root
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  size="3"
                />
              </Box>

              <Box>
                <Text as="label" htmlFor="password" size="2" weight="medium" mb="1" className="block">
                  비밀번호
                </Text>
                <TextField.Root
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  size="3"
                />
              </Box>

              {error && (
                <Callout.Root color="red" role="alert">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}

              <Button type="submit" size="3" disabled={loading} className="w-full">
                {loading && <Spinner size="1" />}
                {loading ? '로그인 중…' : '로그인'}
              </Button>
            </Flex>
          </form>

          <Box mt="6" pt="5" className="border-t border-gray-4">
            <Text size="1" color="gray" weight="medium">
              데모 계정으로 바로 시작하기
            </Text>
            <Flex gap="2" mt="3">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.role}
                  type="button"
                  variant="soft"
                  size="2"
                  onClick={() => fillDemo(account)}
                  disabled={loading}
                  className="flex-1 flex-col h-auto py-[0.6rem] px-[0.5rem] items-start gap-[2px]"
                >
                  <Text size="2" weight="bold">{account.label}</Text>
                  <Text size="1" color="gray">클릭해서 입력</Text>
                </Button>
              ))}
            </Flex>
          </Box>
        </Box>
      </div>
    </div>
  );
}
