import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';

import {
  FeatureUnavailableError,
  HuntActionError,
  HuntNotFoundError,
  type CancelSummary,
  type HuntFollowUpRepository,
  type InvitationEntry,
  type Participation,
  type ReviewItem,
  type SendSummary,
} from '@/data/hunt-follow-up';
import { toHunt, toIsoInstant, toPocketBaseDateTime } from '@/data/pocketbase-hunt-repository';
import type { Outcome, OrganizerSession } from '@/data/pocketbase-session';
import {
  Collections,
  type HuntsResponse,
  type InvitationsResponse,
  type MembersResponse,
  type SmsReviewQueueResponse,
  type Update,
} from '@/lib/pocketbase-types';

type MemberName = Pick<MembersResponse, 'id' | 'name'>;
type InvitationWithMember = InvitationsResponse<{ member?: MemberName }>;
type InvitationWithHunt = InvitationsResponse<{ hunt?: Pick<HuntsResponse, 'id' | 'date'> }>;
// `reason` comes with backend PR #12 (not in the generated types on main yet).
type ReviewRecord = SmsReviewQueueResponse<{ member?: MemberName }> & { reason?: string };

/** Attendance of a hunt (`GET /api/diane/hunts/{id}/attendance`): only what the app reads. */
type Attendance = { free_places: number | null };

const status = (error: unknown) => (error instanceof ClientResponseError ? error.status : 0);

/** A 404 on a record may come from a revoked token (PocketBase treats it as a guest). */
const notFound = (outcome: Outcome<unknown>) => 'error' in outcome && status(outcome.error) === 404;

/** Follow-up of hunts in PocketBase (collections and Diane routes), as the organizer. */
export function createPocketBaseHuntFollowUp(
  pb: PocketBase,
  session: OrganizerSession
): HuntFollowUpRepository {
  const invitations = () => pb.collection(Collections.Invitations);

  /** A Diane route; a refusal becomes a `HuntActionError` with the server's reason. */
  async function huntAction<T>(huntId: string, action: string): Promise<T> {
    try {
      return await session.run(() =>
        pb.send<T>(`/api/diane/hunts/${encodeURIComponent(huntId)}/${action}`, { method: 'POST' })
      );
    } catch (error) {
      if (status(error) === 503) {
        throw new HuntActionError('server_not_configured');
      }
      const code = (error as ClientResponseError).response?.data?.hunt?.code;
      if (status(error) === 409 && typeof code === 'string') {
        throw new HuntActionError(code);
      }
      throw error;
    }
  }

  async function updateInvitation(id: string, participation: Participation, via: 'manual' | 'sms') {
    const changes: Update<'invitations'> = {
      participation,
      answered_via: via,
      answered_at: toPocketBaseDateTime(new Date().toISOString()),
    };
    await session.run(() => invitations().update(id, changes), { isDoubtful: notFound });
  }

  return {
    async getHunt(id) {
      try {
        const record = await session.run(
          () => pb.collection(Collections.Hunts).getOne<HuntsResponse>(id),
          { isDoubtful: notFound }
        );
        return { ...toHunt(record), status: record.status };
      } catch (error) {
        if (status(error) === 404) {
          throw new HuntNotFoundError(id);
        }
        throw error;
      }
    },
    async listInvitations(huntId) {
      const records = await session.run(
        () =>
          invitations().getFullList<InvitationWithMember>({
            filter: pb.filter('hunt = {:hunt}', { hunt: huntId }),
            expand: 'member',
          }),
        { isDoubtful: (outcome) => 'result' in outcome && outcome.result.length === 0 }
      );
      return records.map(toInvitationEntry);
    },
    async countActiveMembers() {
      const result = await session.run(
        () =>
          pb
            .collection(Collections.Members)
            .getList(1, 1, { filter: 'active = true', fields: 'id' }),
        { isDoubtful: (outcome) => 'result' in outcome && outcome.result.totalItems === 0 }
      );
      return result.totalItems;
    },
    sendInvitations: (huntId) => huntAction<SendSummary>(huntId, 'send-invitations'),
    resendFailed: (huntId) => huntAction<SendSummary>(huntId, 'resend-failed'),
    async cancelHunt(huntId) {
      try {
        return await huntAction<CancelSummary>(huntId, 'cancel');
      } catch (error) {
        // Route added by backend PR #12: a server without it answers 404.
        if (status(error) === 404) {
          throw new FeatureUnavailableError('cancel');
        }
        throw error;
      }
    },
    setParticipation: (id, participation) => updateInvitation(id, participation, 'manual'),
    async applyAnswer({ id, huntId }, answer) {
      if (answer === 'no') {
        return updateInvitation(id, 'absent', 'sms');
      }
      const attendance = await session.run(() =>
        pb.send<Attendance>(`/api/diane/hunts/${encodeURIComponent(huntId)}/attendance`, {})
      );
      return updateInvitation(id, attendance.free_places === 0 ? 'waiting_list' : 'present', 'sms');
    },
    async listReviewItems() {
      const records = await session.run(
        () =>
          pb.collection(Collections.SmsReviewQueue).getFullList<ReviewRecord>({
            filter: 'resolved = false',
            sort: '-received_at',
            expand: 'member',
          }),
        { isDoubtful: (outcome) => 'result' in outcome && outcome.result.length === 0 }
      );
      return records.map(toReviewItem);
    },
    async resolveReviewItem(id) {
      const changes: Update<'sms_review_queue'> = { resolved: true };
      await session.run(() => pb.collection(Collections.SmsReviewQueue).update(id, changes), {
        isDoubtful: notFound,
      });
    },
    async listOpenInvitations(memberId, today) {
      const records = await session.run(() =>
        invitations().getFullList<InvitationWithHunt>({
          filter: pb.filter(
            'member = {:member} && hunt.date >= {:today} && hunt.status != "cancelled"',
            { member: memberId, today }
          ),
          expand: 'hunt',
          sort: 'hunt.date',
        })
      );
      return records.flatMap((record) =>
        record.expand?.hunt
          ? [{ id: record.id, huntId: record.expand.hunt.id, huntDate: record.expand.hunt.date }]
          : []
      );
    },
  };
}

function toInvitationEntry(record: InvitationWithMember): InvitationEntry {
  return {
    id: record.id,
    participation: record.participation,
    answered_at: record.answered_at ? toIsoInstant(record.answered_at) : null,
    answered_via: record.answered_via || null,
    sms_status: record.sms_status || null,
    email_status: record.email_status || null,
    member: {
      id: record.member,
      // A member deleted meanwhile has no expand: no name to show.
      name: record.expand?.member?.name ?? '',
    },
  };
}

function toReviewItem(record: ReviewRecord): ReviewItem {
  const member = record.expand?.member;
  return {
    id: record.id,
    from_phone: record.from_phone,
    body: record.body,
    received_at: toIsoInstant(record.received_at),
    reason: record.reason || null,
    member: member ? { id: member.id, name: member.name } : null,
  };
}
