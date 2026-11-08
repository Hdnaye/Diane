// French phone numbers, read like the back-end does (backend/pb_hooks/lib/phone.cjs): stored in
// E.164 (+33XXXXXXXXX), typed and shown in the national format (06 39 98 00 01).

/** Separators people type between digit groups: spaces, dots, dashes, slashes. */
const SEPARATORS = /[\s  .\-/]/g;

/** `input` as a French E.164 number, or null if it is not one. */
export function normalizeFrenchPhone(input: string): string | null {
  const compact = input.replace(SEPARATORS, '').replace('(0)', '0');
  const match = /^(?:0|\+330?|00330?)([1-9][0-9]{8})$/.exec(compact);
  return match ? `+33${match[1]}` : null;
}

/** "+33639980001" → "06 39 98 00 01"; anything else is returned as is. */
export function formatFrenchPhone(phone: string): string {
  const match = /^\+33([1-9][0-9]{8})$/.exec(phone);
  if (!match) {
    return phone;
  }
  return `0${match[1]}`.replace(/(\d{2})(?=\d)/g, '$1 ');
}
