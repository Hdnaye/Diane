import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import type { ManualParticipation } from '@/data/hunt-follow-up';
import { huntKeys, useServerConnection } from '@/data/hunt-queries';
import { useHuntFollowUpRepository } from '@/data/hunt-repository-context';

/** A hunt and its answers are refreshed this often while its screen is shown. */
export const ATTENDANCE_REFRESH_MS = 15_000;

/** The SMS to check are refreshed this often while a screen showing them is focused. */
export const REVIEW_REFRESH_MS = 30_000;

export const followUpKeys = {
  hunt: (id: string) => [...huntKeys.all, id] as const,
  invitations: (id: string) => [...huntKeys.all, id, 'invitations'] as const,
  activeMembers: ['active-members'] as const,
  review: ['sms-review'] as const,
  openInvitations: (memberId: string) => ['open-invitations', memberId] as const,
  sending: (id: string) => ['send-invitations', id] as const,
};

/** A hunt, refreshed while its screen is focused: the answer of a sending may never come. */
export function useHuntDetail(id: string) {
  const followUp = useHuntFollowUpRepository();
  const connection = useServerConnection();
  const focused = useIsFocused();
  return useQuery({
    queryKey: followUpKeys.hunt(id),
    queryFn: () => followUp.getHunt(id),
    enabled: connection.isSuccess,
    refetchInterval: focused ? ATTENDANCE_REFRESH_MS : false,
  });
}

/** The invitations of a hunt and their answers, refreshed while the screen is focused. */
export function useInvitations(huntId: string) {
  const followUp = useHuntFollowUpRepository();
  const connection = useServerConnection();
  const focused = useIsFocused();
  return useQuery({
    queryKey: followUpKeys.invitations(huntId),
    queryFn: () => followUp.listInvitations(huntId),
    enabled: connection.isSuccess,
    refetchInterval: focused ? ATTENDANCE_REFRESH_MS : false,
  });
}

export function useActiveMemberCount(enabled: boolean) {
  const followUp = useHuntFollowUpRepository();
  const connection = useServerConnection();
  return useQuery({
    queryKey: followUpKeys.activeMembers,
    queryFn: () => followUp.countActiveMembers(),
    enabled: enabled && connection.isSuccess,
  });
}

/** After an action on a hunt: its status, its answers and the hunt list may have changed. */
function useRefreshHunts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: huntKeys.all });
}

/**
 * Sending the invitations: synchronous on the server, it may last minutes with a slow gateway
 * phone. The app sets no timeout on the request and neither does the SDK or React Native on
 * Android, but iOS may end it after a minute without an answer (URLSession's default, not checked
 * on a device): the sending then goes on on the server. The answers keep being refreshed meanwhile.
 */
export function useSendInvitations(huntId: string) {
  const followUp = useHuntFollowUpRepository();
  const refresh = useRefreshHunts();
  return useMutation({
    mutationKey: followUpKeys.sending(huntId),
    mutationFn: () => followUp.sendInvitations(huntId),
    onSettled: refresh,
  });
}

/** Whether the invitations of this hunt are being sent, from any screen. */
export function useIsSending(huntId: string): boolean {
  return useIsMutating({ mutationKey: followUpKeys.sending(huntId) }) > 0;
}

export function useResendFailed(huntId: string) {
  const followUp = useHuntFollowUpRepository();
  const refresh = useRefreshHunts();
  return useMutation({
    mutationFn: () => followUp.resendFailed(huntId),
    onSettled: refresh,
  });
}

export function useCancelHunt(huntId: string) {
  const followUp = useHuntFollowUpRepository();
  const refresh = useRefreshHunts();
  return useMutation({
    mutationFn: () => followUp.cancelHunt(huntId),
    onSettled: refresh,
  });
}

export function useSetParticipation() {
  const followUp = useHuntFollowUpRepository();
  const refresh = useRefreshHunts();
  return useMutation({
    mutationFn: ({ id, participation }: { id: string; participation: ManualParticipation }) =>
      followUp.setParticipation(id, participation),
    onSettled: refresh,
  });
}

/** Unresolved SMS to check: new ones arrive at any time, and the home screen stays mounted. */
export function useReviewItems() {
  const followUp = useHuntFollowUpRepository();
  const connection = useServerConnection();
  const focused = useIsFocused();
  return useQuery({
    queryKey: followUpKeys.review,
    queryFn: () => followUp.listReviewItems(),
    enabled: connection.isSuccess,
    refetchInterval: focused ? REVIEW_REFRESH_MS : false,
  });
}

export function useOpenInvitations(memberId: string | null, today: string) {
  const followUp = useHuntFollowUpRepository();
  const connection = useServerConnection();
  return useQuery({
    queryKey: followUpKeys.openInvitations(memberId ?? ''),
    queryFn: () => followUp.listOpenInvitations(memberId ?? '', today),
    enabled: memberId !== null && connection.isSuccess,
  });
}

export function useResolveReviewItem() {
  const followUp = useHuntFollowUpRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => followUp.resolveReviewItem(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: followUpKeys.review }),
  });
}

/** Applies the answer of an SMS to check to one of the member's invitations, then resolves it. */
export function useApplyReviewAnswer() {
  const followUp = useHuntFollowUpRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      invitation,
      answer,
    }: {
      itemId: string;
      invitation: { id: string; huntId: string };
      answer: 'yes' | 'no';
    }) => {
      await followUp.applyAnswer(invitation, answer);
      await followUp.resolveReviewItem(itemId);
    },
    onSettled: (_data, _error, { invitation }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: followUpKeys.review }),
        queryClient.invalidateQueries({ queryKey: followUpKeys.hunt(invitation.huntId) }),
      ]),
  });
}
