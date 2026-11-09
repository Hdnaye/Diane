import { createContext, useContext, type ReactNode } from 'react';

import type { MemberRepository } from '@/data/member-repository';

const MemberRepositoryContext = createContext<MemberRepository | null>(null);

/** Provides the members: PocketBase in the app (`app-backend.ts`), in memory in tests. */
export function MemberRepositoryProvider({
  repository,
  children,
}: {
  repository: MemberRepository;
  children: ReactNode;
}) {
  return (
    <MemberRepositoryContext.Provider value={repository}>
      {children}
    </MemberRepositoryContext.Provider>
  );
}

export function useMemberRepository(): MemberRepository {
  const repository = useContext(MemberRepositoryContext);
  if (!repository) {
    throw new Error('Member hooks must be used inside a MemberRepositoryProvider');
  }
  return repository;
}
