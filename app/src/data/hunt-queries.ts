import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHuntRepository } from '@/data/hunt-repository-context';
import type { NewHunt } from '@/data/types';

export const huntKeys = {
  all: ['hunts'] as const,
};

/** All hunts, sorted by day. */
export function useHunts() {
  const repository = useHuntRepository();
  return useQuery({ queryKey: huntKeys.all, queryFn: () => repository.list() });
}

export function useCreateHunt() {
  const repository = useHuntRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hunt: NewHunt) => repository.create(hunt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: huntKeys.all }),
  });
}
