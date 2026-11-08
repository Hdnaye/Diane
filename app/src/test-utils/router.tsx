import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType } from 'react';

import { createInMemoryHuntRepository, type HuntRepository } from '@/data/hunt-repository';
import { HuntRepositoryProvider } from '@/data/hunt-repository-context';
import type { Hunt } from '@/data/types';

type Routes = Record<string, ComponentType>;

/**
 * Renders screens in a router with a fresh query client and an in-memory hunt repository,
 * so each test starts from its own data.
 */
export async function renderScreens(
  routes: Routes,
  {
    initialUrl = '/',
    hunts = [],
    repository = createInMemoryHuntRepository(hunts),
  }: { initialUrl?: string; hunts?: Hunt[]; repository?: HuntRepository } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function TestLayout() {
    return (
      <QueryClientProvider client={queryClient}>
        <HuntRepositoryProvider repository={repository}>
          <Stack />
        </HuntRepositoryProvider>
      </QueryClientProvider>
    );
  }
  const result = await renderRouter({ _layout: TestLayout, ...routes }, { initialUrl });
  return { ...result, repository };
}

/** A fictitious hunt for tests. */
export function aHunt(overrides: Partial<Hunt> & Pick<Hunt, 'date'>): Hunt {
  return {
    id: `hunt-${overrides.date}`,
    meetingTime: '08:00',
    maxParticipants: null,
    responseDeadline: new Date(2026, 10, 1, 20, 0).toISOString(),
    ...overrides,
  };
}
