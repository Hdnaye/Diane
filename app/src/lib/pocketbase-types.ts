// Generated file, ne pas modifier à la main (do not edit by hand):
// run `npm run typegen` in backend/ after changing pb_migrations/.
/* eslint-disable @typescript-eslint/no-redeclare -- each select field is a const and a type of the same name */
/**
 * This file was @generated using pocketbase-typegen
 */

export const Collections = {
  Authorigins: '_authOrigins',
  Externalauths: '_externalAuths',
  Mfas: '_mfas',
  Otps: '_otps',
  Superusers: '_superusers',
  Hunts: 'hunts',
  Invitations: 'invitations',
  Members: 'members',
  MessageTemplates: 'message_templates',
  Organizers: 'organizers',
  SmsInbound: 'sms_inbound',
  SmsReviewQueue: 'sms_review_queue',
} as const;
export type Collections = (typeof Collections)[keyof typeof Collections];

// Alias types for improved usability
export type IsoDateString = string;
export type IsoAutoDateString = string & { readonly autodate: unique symbol };
export type RecordIdString = string;
export type FileNameString = string & { readonly filename: unique symbol };
export type HTMLString = string;

type ExpandType<T> = unknown extends T
  ? T extends unknown
    ? { expand?: unknown }
    : { expand: T }
  : { expand: T };

// System fields
export type BaseSystemFields<T = unknown> = {
  id: RecordIdString;
  collectionId: string;
  collectionName: Collections;
} & ExpandType<T>;

export type AuthSystemFields<T = unknown> = {
  email: string;
  emailVisibility: boolean;
  username: string;
  verified: boolean;
} & BaseSystemFields<T>;

// Record types for each collection

export type AuthoriginsRecord = {
  collectionRef: string;
  created: IsoAutoDateString;
  fingerprint: string;
  id: string;
  recordRef: string;
  updated: IsoAutoDateString;
};

export type ExternalauthsRecord = {
  collectionRef: string;
  created: IsoAutoDateString;
  id: string;
  provider: string;
  providerId: string;
  recordRef: string;
  updated: IsoAutoDateString;
};

export type MfasRecord = {
  collectionRef: string;
  created: IsoAutoDateString;
  id: string;
  method: string;
  recordRef: string;
  updated: IsoAutoDateString;
};

export type OtpsRecord = {
  collectionRef: string;
  created: IsoAutoDateString;
  id: string;
  password: string;
  recordRef: string;
  sentTo?: string;
  updated: IsoAutoDateString;
};

export type SuperusersRecord = {
  created: IsoAutoDateString;
  email: string;
  emailVisibility?: boolean;
  id: string;
  password: string;
  tokenKey: string;
  updated: IsoAutoDateString;
  verified?: boolean;
};

export const HuntsStatusOptions = {
  draft: 'draft',
  invitations_sent: 'invitations_sent',
  closed: 'closed',
  cancelled: 'cancelled',
} as const;
export type HuntsStatusOptions = (typeof HuntsStatusOptions)[keyof typeof HuntsStatusOptions];
export type HuntsRecord = {
  cancelled_at?: IsoDateString;
  created: IsoAutoDateString;
  date: string;
  id: string;
  invitations_sent_at?: IsoDateString;
  max_participants?: number;
  meeting_time: string;
  reminder_sent_at?: IsoDateString;
  response_deadline?: IsoDateString;
  status: HuntsStatusOptions;
  updated: IsoAutoDateString;
};

export const InvitationsParticipationOptions = {
  pending: 'pending',
  present: 'present',
  waiting_list: 'waiting_list',
  absent: 'absent',
} as const;
export type InvitationsParticipationOptions =
  (typeof InvitationsParticipationOptions)[keyof typeof InvitationsParticipationOptions];

export const InvitationsAnsweredViaOptions = {
  sms: 'sms',
  web: 'web',
  manual: 'manual',
} as const;
export type InvitationsAnsweredViaOptions =
  (typeof InvitationsAnsweredViaOptions)[keyof typeof InvitationsAnsweredViaOptions];

export const InvitationsSmsStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsSmsStatusOptions =
  (typeof InvitationsSmsStatusOptions)[keyof typeof InvitationsSmsStatusOptions];

export const InvitationsEmailStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsEmailStatusOptions =
  (typeof InvitationsEmailStatusOptions)[keyof typeof InvitationsEmailStatusOptions];

export const InvitationsReminderSmsStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsReminderSmsStatusOptions =
  (typeof InvitationsReminderSmsStatusOptions)[keyof typeof InvitationsReminderSmsStatusOptions];

export const InvitationsReminderEmailStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsReminderEmailStatusOptions =
  (typeof InvitationsReminderEmailStatusOptions)[keyof typeof InvitationsReminderEmailStatusOptions];

export const InvitationsCancellationSmsStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsCancellationSmsStatusOptions =
  (typeof InvitationsCancellationSmsStatusOptions)[keyof typeof InvitationsCancellationSmsStatusOptions];

export const InvitationsCancellationEmailStatusOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
  not_sent: 'not_sent',
} as const;
export type InvitationsCancellationEmailStatusOptions =
  (typeof InvitationsCancellationEmailStatusOptions)[keyof typeof InvitationsCancellationEmailStatusOptions];
export type InvitationsRecord = {
  answered_at?: IsoDateString;
  answered_via?: InvitationsAnsweredViaOptions;
  cancellation_email_attempts?: number;
  cancellation_email_status?: InvitationsCancellationEmailStatusOptions;
  cancellation_sms_attempts?: number;
  cancellation_sms_status?: InvitationsCancellationSmsStatusOptions;
  created: IsoAutoDateString;
  email_status?: InvitationsEmailStatusOptions;
  hunt: RecordIdString;
  id: string;
  member: RecordIdString;
  participation: InvitationsParticipationOptions;
  reminder_email_attempts?: number;
  reminder_email_status?: InvitationsReminderEmailStatusOptions;
  reminder_sms_attempts?: number;
  reminder_sms_status?: InvitationsReminderSmsStatusOptions;
  sms_status?: InvitationsSmsStatusOptions;
  token: string;
  updated: IsoAutoDateString;
};

export type MembersRecord = {
  active?: boolean;
  created: IsoAutoDateString;
  email?: string;
  id: string;
  name: string;
  phone?: string;
  updated: IsoAutoDateString;
};

export type MessageTemplatesRecord = {
  body: string;
  created: IsoAutoDateString;
  id: string;
  is_default?: boolean;
  name: string;
  updated: IsoAutoDateString;
};

export type OrganizersRecord = {
  created: IsoAutoDateString;
  email: string;
  emailVisibility?: boolean;
  id: string;
  password: string;
  tokenKey: string;
  updated: IsoAutoDateString;
  verified?: boolean;
};

export const SmsInboundOutcomeOptions = {
  applied: 'applied',
  cancelled: 'cancelled',
  review: 'review',
  ignored: 'ignored',
} as const;
export type SmsInboundOutcomeOptions =
  (typeof SmsInboundOutcomeOptions)[keyof typeof SmsInboundOutcomeOptions];

export const SmsInboundConfirmationOptions = {
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
  skipped: 'skipped',
} as const;
export type SmsInboundConfirmationOptions =
  (typeof SmsInboundConfirmationOptions)[keyof typeof SmsInboundConfirmationOptions];
export type SmsInboundRecord = {
  confirmation?: SmsInboundConfirmationOptions;
  created: IsoAutoDateString;
  event_id: string;
  id: string;
  member?: RecordIdString;
  outcome: SmsInboundOutcomeOptions;
  updated: IsoAutoDateString;
};

export const SmsReviewQueueReasonOptions = {
  unknown_sender: 'unknown_sender',
  inactive_member: 'inactive_member',
  unrecognized: 'unrecognized',
  no_open_invitation: 'no_open_invitation',
  several_open_invitations: 'several_open_invitations',
  unknown_day: 'unknown_day',
  ambiguous_day: 'ambiguous_day',
  deadline_passed: 'deadline_passed',
  hunt_closed: 'hunt_closed',
  ambiguous: 'ambiguous',
} as const;
export type SmsReviewQueueReasonOptions =
  (typeof SmsReviewQueueReasonOptions)[keyof typeof SmsReviewQueueReasonOptions];
export type SmsReviewQueueRecord = {
  body: string;
  created: IsoAutoDateString;
  from_phone: string;
  id: string;
  member?: RecordIdString;
  reason?: SmsReviewQueueReasonOptions;
  received_at: IsoDateString;
  resolved?: boolean;
  resolved_at?: IsoDateString;
  updated: IsoAutoDateString;
};

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> &
  BaseSystemFields<Texpand>;
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> &
  BaseSystemFields<Texpand>;
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>;
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>;
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> &
  AuthSystemFields<Texpand>;
export type HuntsResponse<Texpand = unknown> = Required<HuntsRecord> & BaseSystemFields<Texpand>;
export type InvitationsResponse<Texpand = unknown> = Required<InvitationsRecord> &
  BaseSystemFields<Texpand>;
export type MembersResponse<Texpand = unknown> = Required<MembersRecord> &
  BaseSystemFields<Texpand>;
export type MessageTemplatesResponse<Texpand = unknown> = Required<MessageTemplatesRecord> &
  BaseSystemFields<Texpand>;
export type OrganizersResponse<Texpand = unknown> = Required<OrganizersRecord> &
  AuthSystemFields<Texpand>;
export type SmsInboundResponse<Texpand = unknown> = Required<SmsInboundRecord> &
  BaseSystemFields<Texpand>;
export type SmsReviewQueueResponse<Texpand = unknown> = Required<SmsReviewQueueRecord> &
  BaseSystemFields<Texpand>;

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
  _authOrigins: AuthoriginsRecord;
  _externalAuths: ExternalauthsRecord;
  _mfas: MfasRecord;
  _otps: OtpsRecord;
  _superusers: SuperusersRecord;
  hunts: HuntsRecord;
  invitations: InvitationsRecord;
  members: MembersRecord;
  message_templates: MessageTemplatesRecord;
  organizers: OrganizersRecord;
  sms_inbound: SmsInboundRecord;
  sms_review_queue: SmsReviewQueueRecord;
};

export type CollectionResponses = {
  _authOrigins: AuthoriginsResponse;
  _externalAuths: ExternalauthsResponse;
  _mfas: MfasResponse;
  _otps: OtpsResponse;
  _superusers: SuperusersResponse;
  hunts: HuntsResponse;
  invitations: InvitationsResponse;
  members: MembersResponse;
  message_templates: MessageTemplatesResponse;
  organizers: OrganizersResponse;
  sms_inbound: SmsInboundResponse;
  sms_review_queue: SmsReviewQueueResponse;
};

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<
  {
    // Omit AutoDate fields
    [
      K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never
    ]: T[K] extends infer U
      ? U extends FileNameString | FileNameString[]
        ? U extends any[]
          ? File[]
          : File
        : U
      : never;
  },
  'id'
>;

// Create type for Auth collections
export type CreateAuth<T> = {
  id?: RecordIdString;
  email: string;
  emailVisibility?: boolean;
  password: string;
  passwordConfirm: string;
  verified?: boolean;
} & ProcessCreateAndUpdateFields<T>;

// Create type for Base collections
export type CreateBase<T> = {
  id?: RecordIdString;
} & ProcessCreateAndUpdateFields<T>;

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
  Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
  email?: string;
  emailVisibility?: boolean;
  oldPassword?: string;
  password?: string;
  passwordConfirm?: string;
  verified?: boolean;
};

// Update type for Base collections
export type UpdateBase<T> = Partial<Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>>;

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
  CollectionResponses[T] extends AuthSystemFields
    ? CreateAuth<CollectionRecords[T]>
    : CreateBase<CollectionRecords[T]>;

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
  CollectionResponses[T] extends AuthSystemFields
    ? UpdateAuth<CollectionRecords[T]>
    : UpdateBase<CollectionRecords[T]>;
