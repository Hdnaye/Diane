// French texts of the hunt follow-up: summaries of sendings and cancellations, refusals,
// answer channels, phone numbers and reasons of the SMS to check.
import type {
  CancelSummary,
  ChannelSummary,
  InvitationEntry,
  SendSummary,
} from '@/data/hunt-follow-up';

/** "1 adhérent invité", "3 adhérents invités". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function channelParts(sms: ChannelSummary, email: ChannelSummary): string[] {
  return [
    sms.sent && plural(sms.sent, 'SMS envoyé', 'SMS envoyés'),
    sms.failed && plural(sms.failed, 'SMS non envoyé', 'SMS non envoyés'),
    sms.not_sent && plural(sms.not_sent, "SMS en attente d'envoi", "SMS en attente d'envoi"),
    email.sent && plural(email.sent, 'e-mail envoyé', 'e-mails envoyés'),
    email.failed && plural(email.failed, 'e-mail non envoyé', 'e-mails non envoyés'),
    email.not_sent &&
      plural(email.not_sent, "e-mail en attente d'envoi", "e-mails en attente d'envoi"),
  ].filter((part): part is string => Boolean(part));
}

function withParts(head: string, sms: ChannelSummary, email: ChannelSummary): string {
  const parts = channelParts(sms, email);
  return parts.length ? `${head} : ${parts.join(', ')}.` : `${head}.`;
}

export function formatSendSummary({ invited, sms, email }: SendSummary): string {
  return invited === 0
    ? 'Aucun nouvel adhérent à inviter.'
    : withParts(plural(invited, 'adhérent invité', 'adhérents invités'), sms, email);
}

export function formatResendSummary({ invited, sms, email }: SendSummary): string {
  return invited === 0
    ? 'Aucun échec à renvoyer.'
    : withParts(plural(invited, 'invitation renvoyée', 'invitations renvoyées'), sms, email);
}

export function formatCancelSummary({ notified, sms, email }: CancelSummary): string {
  return notified === 0
    ? 'Battue annulée. Aucun adhérent à prévenir.'
    : withParts(
        `Battue annulée. ${plural(notified, 'adhérent prévenu', 'adhérents prévenus')}`,
        sms,
        email
      );
}

/** Reasons given by the server for a refused sending (`data.hunt.code`). */
export const SENDING_REFUSALS: Record<string, string> = {
  deadline_missing:
    'Pas de date limite de réponse, et il est trop tard pour en fixer une avant la battue.',
  deadline_passed:
    'La date limite de réponse est dépassée : les invitations ne peuvent plus partir.',
  hunt_cancelled: 'Cette battue est annulée : les invitations ne peuvent pas partir.',
  hunt_closed: 'Cette battue est terminée : les invitations ne peuvent pas partir.',
  server_not_configured:
    "Le serveur n'est pas configuré pour envoyer les invitations (adresse publique manquante).",
};

export const ANSWER_CHANNELS: Record<NonNullable<InvitationEntry['answered_via']>, string> = {
  sms: 'Par SMS',
  web: 'Par le lien',
  manual: 'Saisi par vous',
};

/** "+33639981234" → "06 39 98 12 34"; other numbers are left as they are. */
export function formatPhone(phone: string): string {
  const match = /^\+33(\d{9})$/.exec(phone);
  if (!match) {
    return phone;
  }
  return `0${match[1]}`.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/** Why an SMS is to check. An unknown or missing reason gets a generic label. */
const REVIEW_REASONS: Record<string, string> = {
  unknown_sender: 'Numéro inconnu',
  inactive_member: 'Adhérent inactif',
  unrecognized: 'Réponse non comprise',
  no_open_invitation: 'Aucune battue ouverte pour cet adhérent',
  several_open_invitations: 'Plusieurs battues ouvertes, jour non précisé',
  unknown_day: 'Aucune battue ouverte le jour indiqué',
  ambiguous_day: 'Jour indiqué ambigu',
  deadline_passed: 'Date limite de réponse dépassée',
  hunt_closed: 'Battue terminée',
  ambiguous: 'Réponse ambiguë ou conditionnelle',
};

export function reviewReason(reason: string | null | undefined): string {
  return (reason && REVIEW_REASONS[reason]) || 'Message non reconnu';
}
