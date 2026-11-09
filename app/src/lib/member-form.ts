import { z } from 'zod';

import type { Member, MemberInput } from '@/data/member-repository';
import { memberMessages, MEMBER_NAME_MAX_LENGTH } from '@/lib/member-messages';
import { formatFrenchPhone, normalizeFrenchPhone } from '@/lib/phone';

/** What the member form edits: the phone number is free text ("06 39 98 00 01"). */
export type MemberFormValues = MemberInput;

export const emptyMemberFormValues: MemberFormValues = {
  name: '',
  phone: '',
  email: '',
  active: true,
};

/** A stored member in the form, its phone number written the usual way. */
export function memberFormValues(member: Member): MemberFormValues {
  return {
    name: member.name,
    phone: formatFrenchPhone(member.phone),
    email: member.email,
    active: member.active,
  };
}

const isEmail = (value: string) => z.email().safeParse(value).success;

/**
 * Validation of the member form, same rules as the back-end; outputs the member to save, its
 * phone number in E.164. Every rule is checked in one pass: all the errors show at once.
 */
export const memberFormSchema = z
  .object({ name: z.string(), phone: z.string(), email: z.string(), active: z.boolean() })
  .superRefine((values, context) => {
    const issue = (path: keyof MemberFormValues, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    const name = values.name.trim();
    const phone = values.phone.trim();
    const email = values.email.trim();
    if (!name) {
      issue('name', memberMessages.nameRequired);
    } else if (name.length > MEMBER_NAME_MAX_LENGTH) {
      issue('name', memberMessages.nameTooLong);
    }
    if (!phone && !email) {
      issue('phone', memberMessages.contactMissing);
    }
    if (phone && !normalizeFrenchPhone(phone)) {
      issue('phone', memberMessages.phoneInvalid);
    }
    if (email && !isEmail(email)) {
      issue('email', memberMessages.emailInvalid);
    }
  })
  .transform((values): MemberInput => ({
    name: values.name.trim(),
    phone: normalizeFrenchPhone(values.phone) ?? '',
    email: values.email.trim().toLowerCase(),
    active: values.active,
  }));
