import { Clock, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { StatusBadge, type AnswerStatus } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { InvitationEntry, Participation } from '@/data/hunt-follow-up';
import { ANSWER_CHANNELS } from '@/lib/follow-up-text';
import { formatParisDateTime } from '@/lib/paris-time';

export const ANSWER_STATUS: Record<Participation, AnswerStatus> = {
  present: 'present',
  waiting_list: 'waiting_list',
  absent: 'absent',
  pending: 'no_answer',
};

type Counts = Record<Participation, number>;

/** Head count of a hunt: present (out of the places), waiting list, absent, no answer. */
export function AttendanceCounters({
  counts,
  maxParticipants,
}: {
  counts: Counts;
  maxParticipants: number | null;
}) {
  const tiles = [
    {
      label: 'Présents',
      value:
        maxParticipants === null ? `${counts.present}` : `${counts.present} / ${maxParticipants}`,
      a11y:
        maxParticipants === null
          ? `Présents : ${counts.present}`
          : `Présents : ${counts.present} sur ${maxParticipants} places`,
    },
    { label: "Liste d'attente", value: `${counts.waiting_list}` },
    { label: 'Absents', value: `${counts.absent}` },
    { label: 'Sans réponse', value: `${counts.pending}` },
  ];
  // Two rows of two tiles: readable on a narrow phone.
  const rows = [tiles.slice(0, 2), tiles.slice(2)];
  return (
    <View className="gap-3">
      {rows.map((row) => (
        <View key={row[0].label} className="flex-row gap-3">
          {row.map((tile) => (
            <View
              key={tile.label}
              accessible
              aria-label={tile.a11y ?? `${tile.label} : ${tile.value}`}
              className="flex-1 gap-1 rounded-xl border border-border bg-card p-4">
              <Text className="font-sans-bold text-3xl text-primary">{tile.value}</Text>
              <Text>{tile.label}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export type RowAction = { label: string; onPress: () => void };

/** A group of answers: heading, then one row per member. */
export function InvitationGroup({
  title,
  entries,
  actionsFor,
  disabled,
}: {
  title: string;
  entries: InvitationEntry[];
  actionsFor: (entry: InvitationEntry) => RowAction[];
  disabled: boolean;
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <View role="list" aria-label={`${title} (${entries.length})`} className="gap-3">
      <Text variant="h3">
        {title} ({entries.length})
      </Text>
      {entries.map((entry) => (
        <InvitationRow
          key={entry.id}
          entry={entry}
          actions={actionsFor(entry)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

function InvitationRow({
  entry,
  actions,
  disabled,
}: {
  entry: InvitationEntry;
  actions: RowAction[];
  disabled: boolean;
}) {
  const failures = [
    entry.sms_status === 'failed' && 'SMS non envoyé',
    entry.email_status === 'failed' && 'E-mail non envoyé',
  ].filter((failure): failure is string => Boolean(failure));
  // Not attempted (gateway unreachable): waiting to be resent, not a failure.
  const waiting = [
    entry.sms_status === 'not_sent' && "SMS en attente d'envoi",
    entry.email_status === 'not_sent' && "E-mail en attente d'envoi",
    entry.sms_status === 'sending' && "SMS en cours d'envoi",
    entry.email_status === 'sending' && "E-mail en cours d'envoi",
  ].filter((item): item is string => Boolean(item));
  const name = entry.member.name || 'Adhérent supprimé';

  return (
    <View role="listitem" className="gap-3 rounded-xl border border-border bg-card p-4">
      <StatusBadge status={ANSWER_STATUS[entry.participation]} />
      <Text variant="large">{name}</Text>
      {entry.answered_via && entry.answered_at && (
        <Text className="text-muted-foreground">
          {ANSWER_CHANNELS[entry.answered_via]}, {formatParisDateTime(new Date(entry.answered_at))}
        </Text>
      )}
      {failures.map((failure) => (
        <View key={failure} className="flex-row items-center gap-2">
          <Icon as={TriangleAlert} className="text-danger" aria-hidden />
          <Text className="font-sans-bold text-danger">{failure}</Text>
        </View>
      ))}
      {waiting.map((item) => (
        <View key={item} className="flex-row items-center gap-2">
          <Icon as={Clock} className="text-warning" aria-hidden />
          <Text className="font-sans-bold text-warning">{item}</Text>
        </View>
      ))}
      {actions.length > 0 && (
        <View className="flex-row flex-wrap gap-3">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              size="sm"
              disabled={disabled}
              aria-label={`${action.label} : ${name}`}
              onPress={action.onPress}>
              <Text>{action.label}</Text>
            </Button>
          ))}
        </View>
      )}
    </View>
  );
}
