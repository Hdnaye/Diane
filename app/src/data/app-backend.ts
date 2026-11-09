import type { HuntFollowUpRepository } from '@/data/hunt-follow-up';
import type { HuntRepository } from '@/data/hunt-repository';
import { createPocketBaseHuntFollowUp } from '@/data/pocketbase-hunt-follow-up';
import type { MemberRepository } from '@/data/member-repository';
import { createPocketBaseHuntRepository } from '@/data/pocketbase-hunt-repository';
import { createPocketBaseMemberRepository } from '@/data/pocketbase-member-repository';
import { createOrganizerSession, createPocketBaseClient } from '@/data/pocketbase-session';
import { ServerConfigMissingError, type ServerConnection } from '@/data/server-connection';
import { readApiConfig, type ApiConfig } from '@/lib/api-config';

export type AppBackend = {
  connection: ServerConnection;
  repository: HuntRepository;
  followUp: HuntFollowUpRepository;
  members: MemberRepository;
};

/** The PocketBase back-end of the app, or one failing clearly when `app/.env` is incomplete. */
export function createAppBackend(config: ApiConfig | null): AppBackend {
  if (!config) {
    const fail = () => Promise.reject(new ServerConfigMissingError());
    return {
      connection: { connect: fail },
      repository: { list: fail, create: fail },
      followUp: {
        getHunt: fail,
        listInvitations: fail,
        countActiveMembers: fail,
        sendInvitations: fail,
        resendFailed: fail,
        cancelHunt: fail,
        setParticipation: fail,
        applyAnswer: fail,
        listReviewItems: fail,
        resolveReviewItem: fail,
        listOpenInvitations: fail,
      },
      members: { list: fail, create: fail, update: fail, remove: fail, setActive: fail },
    };
  }
  const pb = createPocketBaseClient(config.url);
  const session = createOrganizerSession(pb, config);
  return {
    connection: { connect: () => session.connect() },
    repository: createPocketBaseHuntRepository(pb, session),
    followUp: createPocketBaseHuntFollowUp(pb, session),
    members: createPocketBaseMemberRepository(pb, session),
  };
}

/** Created once for the whole app, so the session survives screens mounted again. */
export const appBackend = createAppBackend(readApiConfig());
