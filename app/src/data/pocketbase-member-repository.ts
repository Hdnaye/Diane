import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';

import {
  MemberValidationError,
  sortByName,
  type Member,
  type MemberField,
  type MemberInput,
  type MemberRepository,
} from '@/data/member-repository';
import type { Outcome, OrganizerSession } from '@/data/pocketbase-session';
import { memberMessages } from '@/lib/member-messages';
import { normalizeFrenchPhone } from '@/lib/phone';
import { Collections, type Create, type MembersResponse } from '@/lib/pocketbase-types';

/** Members stored in PocketBase (collection `members`), as the authenticated organizer. */
export function createPocketBaseMemberRepository(
  pb: PocketBase,
  session: OrganizerSession
): MemberRepository {
  const members = () => pb.collection(Collections.Members);

  /** Sends a write; field errors become a `MemberValidationError`. */
  async function write(request: () => Promise<MembersResponse>): Promise<Member> {
    try {
      return toMember(await session.run(request, { isDoubtful: isRefusedAsGuest }));
    } catch (error) {
      throw toValidationError(error) ?? error;
    }
  }

  return {
    async list() {
      const records = await session.run(
        () => members().getFullList<MembersResponse>({ sort: 'name' }),
        // A revoked token sees an empty list (PocketBase treats it as a guest).
        { isDoubtful: (outcome) => 'result' in outcome && outcome.result.length === 0 }
      );
      // Sorted again here: PocketBase compares names byte by byte ("Émile" after "Zoé").
      return sortByName(records.map(toMember));
    },
    create(member) {
      return write(() => members().create<MembersResponse>(toRecord(member)));
    },
    update(id, member) {
      return write(() => members().update<MembersResponse>(id, toRecord(member)));
    },
    setActive(id, active) {
      return write(() => members().update<MembersResponse>(id, { active }));
    },
    async remove(id) {
      await session.run(() => members().delete(id), { isDoubtful: isRefusedAsGuest });
    },
  };
}

function toMember(record: MembersResponse): Member {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    email: record.email,
    active: record.active,
  };
}

/** The phone number is sent in E.164 when it reads as a French number (the back-end checks it). */
function toRecord(member: MemberInput): Create<'members'> {
  const phone = member.phone.trim();
  return {
    name: member.name.trim(),
    phone: (phone && normalizeFrenchPhone(phone)) || phone,
    email: member.email.trim(),
    active: member.active,
  };
}

/**
 * What a revoked token, treated as a guest by PocketBase, gets: a write refused without any field
 * error (400), forbidden (403), or a record not found (404, update and delete rules).
 */
function isRefusedAsGuest(outcome: Outcome<unknown>): boolean {
  if (!('error' in outcome) || !(outcome.error instanceof ClientResponseError)) {
    return false;
  }
  const { status, response } = outcome.error;
  return (
    status === 403 ||
    status === 404 ||
    (status === 400 && Object.keys(response?.data ?? {}).length === 0)
  );
}

type FieldError = { code?: string };

/** French messages for the fields refused by the back-end, or null for any other error. */
function toValidationError(error: unknown): MemberValidationError | null {
  if (!(error instanceof ClientResponseError) || error.status !== 400) {
    return null;
  }
  const data = (error.response?.data ?? {}) as Partial<Record<MemberField, FieldError>>;
  const fields: Partial<Record<MemberField, string>> = {};
  if (data.name) {
    fields.name =
      data.name.code === 'validation_max_text_constraint'
        ? memberMessages.nameTooLong
        : memberMessages.nameRequired;
  }
  const contactMissing = [data.phone, data.email].some(
    (field) => field?.code === 'missing_contact'
  );
  if (contactMissing) {
    fields.phone = memberMessages.contactMissing;
  } else {
    if (data.phone) {
      fields.phone =
        data.phone.code === 'validation_not_unique'
          ? memberMessages.phoneTaken
          : memberMessages.phoneInvalid;
    }
    if (data.email) {
      fields.email =
        data.email.code === 'validation_not_unique'
          ? memberMessages.emailTaken
          : memberMessages.emailInvalid;
    }
  }
  return Object.keys(fields).length > 0 ? new MemberValidationError(fields) : null;
}
