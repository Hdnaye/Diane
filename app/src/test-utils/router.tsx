import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType } from 'react';

import { createInMemoryHuntFollowUp, type HuntFollowUpRepository } from '@/data/hunt-follow-up';
import { createInMemoryHuntRepository, type HuntRepository } from '@/data/hunt-repository';
import { HuntRepositoryProvider } from '@/data/hunt-repository-context';
import { alwaysConnected, type ServerConnection } from '@/data/server-connection';
import type { Hunt } from '@/data/types';

type Routes = Record<string, ComponentType>;

/**
 * Renders screens in a router with a fresh query client, in-memory hunt and follow-up
 * repositories and a server connection that succeeds (unless given),
 * so each test starts from its own data.
 */
export async function renderScreens(
  routes: Routes,
  {
    initialUrl = '/',
    hunts = [],
    repository = createInMemoryHuntRepository(hunts),
    connection = alwaysConnected,
    followUp = createInMemoryHuntFollowUp(),
  }: {
    initialUrl?: string;
    hunts?: Hunt[];
    repository?: HuntRepository;
    connection?: ServerConnection;
    followUp?: HuntFollowUpRepository;
  } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function TestLayout() {
    return (
      <QueryClientProvider client={queryClient}>
        <HuntRepositoryProvider repository={repository} connection={connection} followUp={followUp}>
          <Stack />
        </HuntRepositoryProvider>
      </QueryClientProvider>
    );
  }
  const result = await renderRouter({ _layout: TestLayout, ...routes }, { initialUrl });
  return { ...result, repository, followUp, queryClient };
}

/** A fictitious hunt for tests. */
export function aHunt(overrides: Partial<Hunt> & Pick<Hunt, 'date'>): Hunt {
  return {
    id: `hunt-${overrides.date}`,
    meeting_time: '08:00',
    max_participants: null,
    response_deadline: '2026-11-01T19:00:00.000Z',
    ...overrides,
  };
}
