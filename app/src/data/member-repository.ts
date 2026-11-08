import { memberMessages, MEMBER_NAME_MAX_LENGTH } from '@/lib/member-messages';
import { normalizeFrenchPhone } from '@/lib/phone';
import type { MembersResponse } from '@/lib/pocketbase-types';

/**
 * A member of the association: `phone` in E.164 (+33639980001) and `email` in lower case, either
 * of them empty but not both; an inactive member is no longer invited to the hunts.
 */
export type Member = Pick<MembersResponse, 'id' | 'name' | 'phone' | 'email' | 'active'>;

/** What the organizer enters: the phone number may be typed freely ("06 39 98 00 01"). */
export type MemberInput = Omit<Member, 'id'>;

export type MemberField = 'name' | 'phone' | 'email';

/** A member refused because of its data: a French message per field. */
export class MemberValidationError extends Error {
  constructor(readonly fields: Partial<Record<MemberField, string>>) {
    super(`Invalid member: ${Object.keys(fields).join(', ')}`);
    this.name = 'MemberValidationError';
  }
}

/**
 * Access to the members. Screens only use this interface (through TanStack Query, see
 * `member-queries.ts`): PocketBase in the app (`pocketbase-member-repository.ts`), in memory in
 * tests.
 */
export interface MemberRepository {
  /** All members, sorted by name (accents and case ignored). */
  list(): Promise<Member[]>;
  /** Rejects with `MemberValidationError` when the data is refused. */
  create(member: MemberInput): Promise<Member>;
  /** Rejects with `MemberValidationError` when the data is refused. */
  update(id: string, member: MemberInput): Promise<Member>;
  /** Deletes the member and, on the back-end, its answers to the hunts (right to erasure). */
  remove(id: string): Promise<void>;
  /** An inactive member is no longer invited. */
  setActive(id: string, active: boolean): Promise<Member>;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

export function sortByName(members: Member[]): Member[] {
  return [...members].sort((a, b) => collator.compare(a.name, b.name));
}

/** In-memory implementation, used by the tests: same rules as the back-end. */
export function createInMemoryMemberRepository(initial: Member[] = []): MemberRepository {
  let members = [...initial];
  let nextId = 1;

  function find(id: string): Member {
    const member = members.find((existing) => existing.id === id);
    if (!member) {
      throw new Error(`No member ${id}`);
    }
    return member;
  }

  function validate(input: MemberInput, id?: string): MemberInput {
    const fields: Partial<Record<MemberField, string>> = {};
    const others = members.filter((existing) => existing.id !== id);
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const rawPhone = input.phone.trim();
    const phone = rawPhone ? normalizeFrenchPhone(rawPhone) : '';

    if (!name) {
      fields.name = memberMessages.nameRequired;
    } else if (name.length > MEMBER_NAME_MAX_LENGTH) {
      fields.name = memberMessages.nameTooLong;
    }
    if (phone === null) {
      fields.phone = memberMessages.phoneInvalid;
    } else if (phone && others.some((other) => other.phone === phone)) {
      fields.phone = memberMessages.phoneTaken;
    }
    if (email && others.some((other) => other.email === email)) {
      fields.email = memberMessages.emailTaken;
    }
    if (!email && !rawPhone) {
      fields.phone = memberMessages.contactMissing;
    }
    if (Object.keys(fields).length > 0) {
      throw new MemberValidationError(fields);
    }
    return { name, email, phone: phone ?? '', active: input.active };
  }

  function replace(member: Member): Member {
    members = members.map((existing) => (existing.id === member.id ? member : existing));
    return member;
  }

  return {
    async list() {
      return sortByName(members);
    },
    async create(input) {
      const member = { ...validate(input), id: `local-${nextId++}` };
      members.push(member);
      return member;
    },
    async update(id, input) {
      find(id);
      return replace({ ...validate(input, id), id });
    },
    async remove(id) {
      find(id);
      members = members.filter((existing) => existing.id !== id);
    },
    async setActive(id, active) {
      return replace({ ...find(id), active });
    },
  };
}
