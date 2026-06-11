'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Container, Flex, Text } from '@radix-ui/themes';
import { useCurrentUser } from '@/entities/session';
import { NotificationBell } from '@/widgets/notification-bell';
import { ROLE_LABEL, ROLE_COLOR } from '../constants';
import type { Props } from '../types';

export function Layout({ context, children }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Flex align="center" gap="2">
            <span className="brand-mark" aria-hidden="true" />
            <Text
              size="3"
              weight="bold"
              className="font-serif tracking-[-0.01em]"
            >
              Allosta
            </Text>
            <Text size="2" color="gray" className="font-mono text-[11px] tracking-[0.04em]">
              / {context}
            </Text>
          </Flex>

          <Flex align="center" gap="3">
            {user?.role === 'CUSTOMER' && <NotificationBell />}
            {user && (
              <Badge color={ROLE_COLOR[user.role]} variant="soft" radius="full">
                {ROLE_LABEL[user.role]}
              </Badge>
            )}
            <Button variant="soft" color="gray" size="2" onClick={handleLogout}>
              로그아웃
            </Button>
          </Flex>
        </div>
      </header>

      <Container size="4" px="4" py="7" style={{ flex: 1 }}>
        {children}
      </Container>

      <Box py="4" px="4" className="border-t border-gray-4">
        <Container size="4">
          <Text size="1" color="gray">Allosta · 건강 상담 운영 플랫폼</Text>
        </Container>
      </Box>
    </div>
  );
}
