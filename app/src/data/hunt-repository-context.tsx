import { createContext, useContext, type ReactNode } from 'react';

import type { HuntRepository } from '@/data/hunt-repository';

const HuntRepositoryContext = createContext<HuntRepository | null>(null);

/** Provides the hunt data source: in memory for now, PocketBase later, a fresh one in tests. */
export function HuntRepositoryProvider({
  repository,
  children,
}: {
  repository: HuntRepository;
  children: ReactNode;
}) {
  return (
    <HuntRepositoryContext.Provider value={repository}>{children}</HuntRepositoryContext.Provider>
  );
}

export function useHuntRepository(): HuntRepository {
  const repository = useContext(HuntRepositoryContext);
  if (!repository) {
    throw new Error('useHuntRepository must be used inside a HuntRepositoryProvider');
  }
  return repository;
}
