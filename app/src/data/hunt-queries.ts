import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHuntRepository, useServerConnectionSource } from '@/data/hunt-repository-context';
import type { NewHunt } from '@/data/types';

export const connectionKey = ['server-connection'] as const;

export const huntKeys = {
  all: ['hunts'] as const,
};

/**
 * The connection to the server (silent authentication), made once for the whole app: every
 * screen shares this query, so mounting screens again does not authenticate again.
 */
export function useServerConnection() {
  const connection = useServerConnectionSource();
  return useQuery({
    queryKey: connectionKey,
    queryFn: async () => {
      await connection.connect();
      return true;
    },
    staleTime: Infinity,
  });
}

/** All hunts, sorted by day, loaded once connected. */
export function useHunts() {
  const repository = useHuntRepository();
  const connection = useServerConnection();
  return useQuery({
    queryKey: huntKeys.all,
    queryFn: () => repository.list(),
    enabled: connection.isSuccess,
  });
}

export function useCreateHunt() {
  const repository = useHuntRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hunt: NewHunt) => repository.create(hunt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: huntKeys.all }),
  });
}
