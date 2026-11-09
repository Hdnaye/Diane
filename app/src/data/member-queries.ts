import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServerConnection } from '@/data/hunt-queries';
import type { MemberInput } from '@/data/member-repository';
import { useMemberRepository } from '@/data/member-repository-context';

export const memberKeys = {
  all: ['members'] as const,
};

/** All members, sorted by name, loaded once connected. */
export function useMembers() {
  const repository = useMemberRepository();
  const connection = useServerConnection();
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: () => repository.list(),
    enabled: connection.isSuccess,
  });
}

/** Mutations on the members; each one reloads the list once done. */
function useMemberMutation<T>(mutationFn: (variables: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useCreateMember() {
  const repository = useMemberRepository();
  return useMemberMutation((member: MemberInput) => repository.create(member));
}

export function useUpdateMember() {
  const repository = useMemberRepository();
  return useMemberMutation(({ id, member }: { id: string; member: MemberInput }) =>
    repository.update(id, member)
  );
}

export function useSetMemberActive() {
  const repository = useMemberRepository();
  return useMemberMutation(({ id, active }: { id: string; active: boolean }) =>
    repository.setActive(id, active)
  );
}

export function useRemoveMember() {
  const repository = useMemberRepository();
  return useMemberMutation((id: string) => repository.remove(id));
}
