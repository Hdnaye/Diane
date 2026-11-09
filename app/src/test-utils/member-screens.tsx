import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType } from 'react';

import { createInMemoryHuntFollowUp } from '@/data/hunt-follow-up';
import { createInMemoryHuntRepository } from '@/data/hunt-repository';
import { HuntRepositoryProvider } from '@/data/hunt-repository-context';
import {
  createInMemoryMemberRepository,
  type Member,
  type MemberRepository,
} from '@/data/member-repository';
import { MemberRepositoryProvider } from '@/data/member-repository-context';
import { alwaysConnected, type ServerConnection } from '@/data/server-connection';

type Routes = Record<string, ComponentType>;

/**
 * Renders screens in a router with a fresh query client, an in-memory member repository (and
 * hunt repository) and a server connection that succeeds (unless given).
 */
export async function renderMemberScreens(
  routes: Routes,
  {
    initialUrl = '/members',
    members = [],
    repository = createInMemoryMemberRepository(members),
    connection = alwaysConnected,
  }: {
    initialUrl?: string;
    members?: Member[];
    repository?: MemberRepository;
    connection?: ServerConnection;
  } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hunts = createInMemoryHuntRepository();
  function TestLayout() {
    return (
      <QueryClientProvider client={queryClient}>
        <HuntRepositoryProvider
          repository={hunts}
          connection={connection}
          followUp={createInMemoryHuntFollowUp()}>
          <MemberRepositoryProvider repository={repository}>
            <Stack />
          </MemberRepositoryProvider>
        </HuntRepositoryProvider>
      </QueryClientProvider>
    );
  }
  const result = await renderRouter({ _layout: TestLayout, ...routes }, { initialUrl });
  return { ...result, repository };
}

/** A fictitious member for tests (CLAUDE.md, "Dépôt public": fictitious data only). */
export function aMember(overrides: Partial<Member> & Pick<Member, 'id' | 'name'>): Member {
  return { phone: '', email: '', active: true, ...overrides };
}

/** A repository whose methods all fail or never answer can be built from this one. */
export function failingMemberRepository(overrides: Partial<MemberRepository>): MemberRepository {
  const unexpected = () => Promise.reject(new Error('unexpected call'));
  return {
    list: unexpected,
    create: unexpected,
    update: unexpected,
    remove: unexpected,
    setActive: unexpected,
    ...overrides,
  };
}
