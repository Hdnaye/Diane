// Follow-up of a hunt: its invitations, the sending, the answers, the cancellation and the SMS
// replies to check. Domain types derive from the types generated from the PocketBase schema.
import type { Hunt } from '@/data/types';
import type {
  HuntsResponse,
  InvitationsResponse,
  MembersResponse,
  SmsReviewQueueResponse,
} from '@/lib/pocketbase-types';

export type HuntStatus = HuntsResponse['status'];

export type HuntDetail = Hunt;

export type Participation = InvitationsResponse['participation'];

type Nullable<T> = { [K in keyof T]: T[K] | null };

/** An invitation and its member. Empty PocketBase values are `null`; times are ISO instants. */
export type InvitationEntry = Pick<InvitationsResponse, 'id' | 'participation'> &
  Nullable<
    Pick<InvitationsResponse, 'answered_at' | 'answered_via' | 'sms_status' | 'email_status'>
  > & {
    updated: string;
    member: Pick<MembersResponse, 'id' | 'name'>;
  };

/** A channel `sending` without news for this long is taken over by `resend-failed` (server). */
const STALE_SENDING_MS = 10 * 60 * 1000;

/**
 * A channel left `sending` by an interrupted request. The server may also see it earlier (older
 * than its last start); the app only knows the delay.
 */
export function isAbandonedSending(
  status: InvitationEntry['sms_status'],
  { updated }: Pick<InvitationEntry, 'updated'>,
  now: number
): boolean {
  return status === 'sending' && now - new Date(updated).getTime() >= STALE_SENDING_MS;
}

/** A channel that `resend-failed` sends again, for an invitation still pending. */
export function isResendable(
  status: InvitationEntry['sms_status'],
  entry: Pick<InvitationEntry, 'updated'>,
  now: number
): boolean {
  return status === 'failed' || status === 'not_sent' || isAbandonedSending(status, entry, now);
}

/**
 * Participation after a member's answer, as on the server (`participationAfterAnswer`): a repeated
 * yes keeps the current place, and a freed place is not given ahead of the members waiting.
 */
export function participationAfterAnswer({
  current,
  answer,
  freePlaces,
  waitingCount,
}: {
  current: Participation;
  answer: 'yes' | 'no';
  /** `null`: no limit. */
  freePlaces: number | null;
  waitingCount: number;
}): Participation {
  if (answer === 'no') return 'absent';
  if (current === 'present' || current === 'waiting_list') return current;
  return freePlaces !== 0 && waitingCount === 0 ? 'present' : 'waiting_list';
}

/** Per channel; `not_sent`: not attempted (gateway unreachable), resent by `resend-failed`. */
export type ChannelSummary = { sent: number; failed: number; skipped: number; not_sent?: number };

/** What `send-invitations` / `resend-failed` answer. */
export type SendSummary = { invited: number; sms: ChannelSummary; email: ChannelSummary };

/** What `cancel` answers. */
export type CancelSummary = { notified: number; sms: ChannelSummary; email: ChannelSummary };

/** An SMS reply the server could not apply. `reason` is `null` when the record has none. */
export type ReviewItem = Pick<
  SmsReviewQueueResponse,
  'id' | 'from_phone' | 'body' | 'received_at'
> & {
  reason: NonNullable<SmsReviewQueueResponse['reason']> | null;
  member: Pick<MembersResponse, 'id' | 'name'> | null;
};

/** An invitation of a member to a hunt still open (not cancelled or closed, not past). */
export type OpenInvitation = { id: string; huntId: string; huntDate: string };

export type ManualParticipation = Exclude<Participation, 'pending'>;

/**
 * Access to the follow-up of hunts. Screens only use this interface (through TanStack Query,
 * see `hunt-follow-up-queries.ts`): PocketBase in the app, in memory in tests.
 */
export interface HuntFollowUpRepository {
  /** Rejects with `HuntNotFoundError` for an unknown hunt. */
  getHunt(id: string): Promise<HuntDetail>;
  listInvitations(huntId: string): Promise<InvitationEntry[]>;
  countActiveMembers(): Promise<number>;
  /** Rejects with `HuntActionError` when the server refuses. */
  sendInvitations(huntId: string): Promise<SendSummary>;
  resendFailed(huntId: string): Promise<SendSummary>;
  cancelHunt(huntId: string): Promise<CancelSummary>;
  /** An answer entered by the organizer (`answered_via: manual`). */
  setParticipation(invitationId: string, participation: ManualParticipation): Promise<void>;
  /**
   * An SMS answer applied by the organizer (`answered_via: sms`), with the same result as when the
   * member answers by himself (`participationAfterAnswer`). An answer that changes nothing is not
   * recorded: its time is the rank on the waiting list.
   */
  applyAnswer(invitation: { id: string; huntId: string }, answer: 'yes' | 'no'): Promise<void>;
  /** Unresolved SMS to check, newest first. */
  listReviewItems(): Promise<ReviewItem[]>;
  resolveReviewItem(id: string): Promise<void>;
  /** Invitations of a member to hunts not cancelled or closed, from `today` (`yyyy-MM-dd`), by day. */
  listOpenInvitations(memberId: string, today: string): Promise<OpenInvitation[]>;
}

export class HuntNotFoundError extends Error {
  constructor(readonly huntId: string) {
    super(`Hunt ${huntId} not found`);
    this.name = 'HuntNotFoundError';
  }
}

export type HuntActionErrorCode =
  | 'hunt_cancelled'
  | 'hunt_closed'
  | 'deadline_passed'
  | 'deadline_missing'
  | 'no_default_template'
  | 'server_not_configured';

/** The server refused to send (reason in `data.hunt.code` or `data.template.code`, or 503). */
export class HuntActionError extends Error {
  constructor(readonly code: HuntActionErrorCode | (string & {})) {
    super(`Refused by the server: ${code}`);
    this.name = 'HuntActionError';
  }
}

type MemoryMember = Pick<MembersResponse, 'id' | 'name'> & { active?: boolean };
type MemoryInvitation = InvitationEntry & { huntId: string };

type MemoryData = {
  hunts?: HuntDetail[];
  members?: MemoryMember[];
  invitations?: (Partial<InvitationEntry> &
    Pick<InvitationEntry, 'id' | 'member'> & {
      huntId: string;
    })[];
  reviewItems?: ReviewItem[];
  /** The messages of a sending go out once this settles; until then, the sending is under way. */
  sendingHeldUntil?: Promise<unknown>;
};

const emptyChannels = (): ChannelSummary => ({ sent: 0, failed: 0, skipped: 0, not_sent: 0 });

/**
 * In-memory implementation, used by the tests: as on the server, a sending first marks the hunt as
 * sent and claims the channels of the active members not yet invited, then every channel is sent;
 * cancelling notifies those who did not answer no. Not reproduced: the default deadline.
 */
export function createInMemoryHuntFollowUp(data: MemoryData = {}) {
  const hunts = [...(data.hunts ?? [])];
  const members = [...(data.members ?? [])];
  const invitations: MemoryInvitation[] = (data.invitations ?? []).map((invitation) => ({
    participation: 'pending',
    answered_at: null,
    answered_via: null,
    sms_status: 'sent',
    email_status: 'skipped',
    updated: new Date().toISOString(),
    ...invitation,
  }));
  const reviewItems = (data.reviewItems ?? []).map((item) => ({ ...item, resolved: false }));
  let nextId = 1;

  function hunt(id: string): HuntDetail {
    const found = hunts.find((candidate) => candidate.id === id);
    if (!found) {
      throw new HuntNotFoundError(id);
    }
    return found;
  }

  function invitation(id: string): MemoryInvitation {
    const found = invitations.find((candidate) => candidate.id === id);
    if (!found) {
      throw new Error(`Invitation ${id} not found`);
    }
    return found;
  }

  function record(id: string, participation: Participation, via: 'manual' | 'sms') {
    Object.assign(invitation(id), {
      participation,
      answered_via: via,
      answered_at: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  }

  function refuseSending(target: HuntDetail) {
    if (target.status === 'cancelled') {
      throw new HuntActionError('hunt_cancelled');
    }
    if (target.status === 'closed') {
      throw new HuntActionError('hunt_closed');
    }
  }

  const repository: HuntFollowUpRepository = {
    async getHunt(id) {
      return { ...hunt(id) };
    },
    async listInvitations(huntId) {
      return invitations
        .filter((candidate) => candidate.huntId === huntId)
        .map(({ huntId: _huntId, ...entry }) => ({ ...entry }));
    },
    async countActiveMembers() {
      return members.filter((member) => member.active !== false).length;
    },
    async sendInvitations(huntId) {
      const target = hunt(huntId);
      refuseSending(target);
      const invited = members.filter(
        (member) =>
          member.active !== false &&
          !invitations.some((item) => item.huntId === huntId && item.member.id === member.id)
      );
      target.status = 'invitations_sent';
      const claimed: MemoryInvitation[] = invited.map((member) => ({
        id: `invitation-${nextId++}`,
        huntId,
        member: { id: member.id, name: member.name },
        participation: 'pending',
        answered_at: null,
        answered_via: null,
        sms_status: 'sending',
        email_status: 'sending',
        updated: new Date().toISOString(),
      }));
      invitations.push(...claimed);
      await data.sendingHeldUntil;
      for (const item of claimed) {
        Object.assign(item, {
          sms_status: 'sent',
          email_status: 'sent',
          updated: new Date().toISOString(),
        });
      }
      return {
        invited: invited.length,
        sms: { ...emptyChannels(), sent: invited.length },
        email: { ...emptyChannels(), sent: invited.length },
      };
    },
    async resendFailed(huntId) {
      refuseSending(hunt(huntId));
      const summary: SendSummary = { invited: 0, sms: emptyChannels(), email: emptyChannels() };
      for (const item of invitations) {
        if (item.huntId !== huntId || item.participation !== 'pending') continue;
        if (members.find((member) => member.id === item.member.id)?.active === false) continue;
        const smsFailed = isResendable(item.sms_status, item, Date.now());
        const emailFailed = isResendable(item.email_status, item, Date.now());
        if (smsFailed) {
          item.sms_status = 'sent';
          summary.sms.sent += 1;
        }
        if (emailFailed) {
          item.email_status = 'sent';
          summary.email.sent += 1;
        }
        if (smsFailed || emailFailed) {
          summary.invited += 1;
          item.updated = new Date().toISOString();
        }
      }
      return summary;
    },
    async cancelHunt(huntId) {
      const target = hunt(huntId);
      target.status = 'cancelled';
      const notified = invitations.filter(
        (item) => item.huntId === huntId && item.participation !== 'absent'
      ).length;
      return {
        notified,
        sms: { ...emptyChannels(), sent: notified },
        email: { ...emptyChannels(), sent: notified },
      };
    },
    async setParticipation(invitationId, participation) {
      record(invitationId, participation, 'manual');
    },
    async applyAnswer({ id, huntId }, answer) {
      const { max_participants: max } = hunt(huntId);
      const count = (participation: Participation) =>
        invitations.filter((item) => item.huntId === huntId && item.participation === participation)
          .length;
      const { participation: current } = invitation(id);
      const participation = participationAfterAnswer({
        current,
        answer,
        freePlaces: max === null ? null : Math.max(0, max - count('present')),
        waitingCount: count('waiting_list'),
      });
      if (participation !== current) record(id, participation, 'sms');
    },
    async listReviewItems() {
      return reviewItems
        .filter((item) => !item.resolved)
        .sort((a, b) => b.received_at.localeCompare(a.received_at))
        .map(({ resolved: _resolved, ...item }) => ({ ...item }));
    },
    async resolveReviewItem(id) {
      const item = reviewItems.find((candidate) => candidate.id === id);
      if (item) item.resolved = true;
    },
    async listOpenInvitations(memberId, today) {
      return invitations
        .filter((item) => item.member.id === memberId)
        .map((item) => ({ item, target: hunt(item.huntId) }))
        .filter(
          ({ target }) =>
            target.status !== 'cancelled' && target.status !== 'closed' && target.date >= today
        )
        .sort((a, b) => a.target.date.localeCompare(b.target.date))
        .map(({ item, target }) => ({ id: item.id, huntId: target.id, huntDate: target.date }));
    },
  };
  return repository;
}
