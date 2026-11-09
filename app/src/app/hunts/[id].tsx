import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ClientResponseError } from 'pocketbase';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { AttendanceCounters, InvitationGroup, type RowAction } from '@/components/attendance';
import { ConfirmPanel } from '@/components/confirm-panel';
import { HuntStatusBadge } from '@/components/hunt-status-badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  FeatureUnavailableError,
  HuntActionError,
  HuntNotFoundError,
  type InvitationEntry,
  type ManualParticipation,
  type Participation,
} from '@/data/hunt-follow-up';
import {
  useActiveMemberCount,
  useCancelHunt,
  useHuntDetail,
  useInvitations,
  useIsSending,
  useResendFailed,
  useSendInvitations,
  useSetParticipation,
} from '@/data/hunt-follow-up-queries';
import { formatLongDay, formatTime } from '@/lib/dates';
import {
  formatCancelSummary,
  formatResendSummary,
  formatSendSummary,
  plural,
  SENDING_REFUSALS,
} from '@/lib/follow-up-text';
import { formatParisDateTime } from '@/lib/paris-time';

type Notice = { tone: 'success' | 'error'; text: string };

type Confirmation =
  | { kind: 'send' }
  | { kind: 'cancel' }
  | { kind: 'full'; entry: InvitationEntry; promote: boolean };

const GROUPS: { participation: Participation; title: string }[] = [
  { participation: 'present', title: 'Présents' },
  { participation: 'waiting_list', title: "Liste d'attente" },
  { participation: 'absent', title: 'Absents' },
  { participation: 'pending', title: 'Sans réponse' },
];

const byName = (a: InvitationEntry, b: InvitationEntry) =>
  a.member.name.localeCompare(b.member.name, 'fr');
// The waiting list keeps the order of the answers: first come, first moved up.
const byAnswerTime = (a: InvitationEntry, b: InvitationEntry) =>
  (a.answered_at ?? '').localeCompare(b.answered_at ?? '');

function sendingError(error: unknown): string {
  if (error instanceof HuntActionError && SENDING_REFUSALS[error.code]) {
    return SENDING_REFUSALS[error.code];
  }
  if (error instanceof ClientResponseError && error.status > 0) {
    return "L'envoi n'a pas pu se faire. Réessayez dans un moment.";
  }
  // No answer: the sending (several minutes with a slow gateway phone) may go on on the server,
  // which never sends a message twice; the statuses below tell what went out.
  return "La connexion au serveur a été interrompue. Si l'envoi avait commencé, il continue sur le serveur : l'état des envois se met à jour ci-dessous.";
}

export default function HuntDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const huntQuery = useHuntDetail(id);
  const invitationsQuery = useInvitations(id);
  const hunt = huntQuery.data;
  const invitations = invitationsQuery.data ?? [];

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const activeMembers = useActiveMemberCount(hunt?.status === 'draft');
  const send = useSendInvitations(id);
  const resend = useResendFailed(id);
  // Shared by every screen of this hunt: opened again during a sending, it stays in progress.
  const sending = useIsSending(id);
  const cancel = useCancelHunt(id);
  const setParticipation = useSetParticipation(id);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([huntQuery.refetch(), invitationsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (!hunt) {
    return (
      <View className="flex-1 gap-4 bg-background px-4 py-6">
        <Stack.Screen options={{ title: 'Battue' }} />
        {huntQuery.error instanceof HuntNotFoundError ? (
          <Text role="alert">Cette battue n'existe pas ou a été supprimée.</Text>
        ) : huntQuery.isError ? (
          <>
            <Text role="alert" className="font-sans-bold text-danger">
              Impossible de charger la battue. Vérifiez la connexion.
            </Text>
            <Button variant="secondary" onPress={() => huntQuery.refetch()}>
              <Text>Réessayer</Text>
            </Button>
          </>
        ) : (
          <Text className="text-muted-foreground">Chargement de la battue…</Text>
        )}
      </View>
    );
  }

  const day = formatLongDay(hunt.date);
  const open = hunt.status !== 'cancelled' && hunt.status !== 'closed';
  const busy = sending || resend.isPending || cancel.isPending;

  const counts: Record<Participation, number> = {
    present: 0,
    waiting_list: 0,
    absent: 0,
    pending: 0,
  };
  for (const entry of invitations) {
    counts[entry.participation] += 1;
  }
  const full = hunt.max_participants !== null && counts.present >= hunt.max_participants;
  const hasFailures = invitations.some(
    (entry) =>
      entry.participation === 'pending' &&
      [entry.sms_status, entry.email_status].some(
        (channel) => channel === 'failed' || channel === 'not_sent'
      )
  );

  function sendInvitations() {
    setConfirmation(null);
    if (sending) return;
    setNotice(null);
    send.mutate(undefined, {
      onSuccess: (summary) => setNotice({ tone: 'success', text: formatSendSummary(summary) }),
      onError: (error) => setNotice({ tone: 'error', text: sendingError(error) }),
    });
  }

  function resendFailed() {
    if (resend.isPending) return;
    setNotice(null);
    resend.mutate(undefined, {
      onSuccess: (summary) => setNotice({ tone: 'success', text: formatResendSummary(summary) }),
      onError: (error) => setNotice({ tone: 'error', text: sendingError(error) }),
    });
  }

  function cancelHunt() {
    setConfirmation(null);
    if (cancel.isPending) return;
    setNotice(null);
    cancel.mutate(undefined, {
      onSuccess: (summary) => setNotice({ tone: 'success', text: formatCancelSummary(summary) }),
      onError: (error) =>
        setNotice({
          tone: 'error',
          text:
            error instanceof FeatureUnavailableError
              ? "Fonction pas encore disponible sur le serveur : la battue n'a pas été annulée."
              : "La battue n'a pas pu être annulée. Vérifiez la connexion, puis réessayez.",
        }),
    });
  }

  function record(entry: InvitationEntry, participation: ManualParticipation) {
    setConfirmation(null);
    setNotice(null);
    setParticipation.mutate(
      { id: entry.id, participation },
      {
        onError: () =>
          setNotice({
            tone: 'error',
            text: "La réponse n'a pas pu être enregistrée. Vérifiez la connexion, puis réessayez.",
          }),
      }
    );
  }

  /** Present, after a warning when the hunt is already full. */
  function markPresent(entry: InvitationEntry, promote: boolean) {
    if (full) {
      setConfirmation({ kind: 'full', entry, promote });
    } else {
      record(entry, 'present');
    }
  }

  function actionsFor(entry: InvitationEntry): RowAction[] {
    if (!open) return [];
    const present = { label: 'Marquer présent', onPress: () => markPresent(entry, false) };
    const promote = { label: 'Faire monter', onPress: () => markPresent(entry, true) };
    const absent = { label: 'Marquer absent', onPress: () => record(entry, 'absent') };
    switch (entry.participation) {
      case 'pending':
        return [present, absent];
      case 'present':
        return [absent];
      case 'absent':
        return [present];
      case 'waiting_list':
        return [promote, absent];
    }
  }

  const count = activeMembers.data;
  const sendQuestion =
    count === undefined
      ? "Envoyer l'invitation par SMS et e-mail à tous les adhérents actifs ?"
      : `Envoyer l'invitation par SMS et e-mail à ${plural(count, 'adhérent actif', 'adhérents actifs')} ?`;

  return (
    <ScrollView
      testID="hunt-detail"
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 py-6"
      refreshControl={
        <RefreshControl testID="hunt-detail-refresh" refreshing={refreshing} onRefresh={refresh} />
      }>
      <Stack.Screen options={{ title: 'Battue' }} />

      <View className="gap-3">
        <Text variant="h2">Battue du {day}</Text>
        <HuntStatusBadge status={hunt.status} />
        <Text>Rendez-vous à {formatTime(hunt.meeting_time)}</Text>
        <Text>
          {hunt.max_participants === null
            ? 'Sans limite de places'
            : `${hunt.max_participants} places au maximum`}
        </Text>
        <Text>
          {hunt.response_deadline
            ? `Réponses jusqu'au ${formatParisDateTime(new Date(hunt.response_deadline))}`
            : "Date limite fixée à l'envoi des invitations"}
        </Text>
      </View>

      {hunt.status === 'draft' &&
        (sending ? (
          <View className="gap-3">
            <Button size="lg" disabled aria-label="Envoi en cours">
              <ActivityIndicator className="text-muted-foreground" />
              <Text>Envoi en cours</Text>
            </Button>
            <Text aria-live="polite">Envoi en cours… Cela peut prendre quelques minutes.</Text>
          </View>
        ) : confirmation?.kind === 'send' ? (
          count === 0 ? (
            <ConfirmPanel
              message="Aucun adhérent actif : ajoutez des adhérents avant d'envoyer les invitations."
              confirmLabel=""
              cancelLabel="Fermer"
              onCancel={() => setConfirmation(null)}
            />
          ) : (
            <ConfirmPanel
              message={sendQuestion}
              confirmLabel="Envoyer"
              cancelLabel="Ne pas envoyer"
              onConfirm={sendInvitations}
              onCancel={() => setConfirmation(null)}
            />
          )
        ) : (
          <Button
            size="lg"
            disabled={busy}
            onPress={() => {
              setNotice(null);
              setConfirmation({ kind: 'send' });
            }}>
            <Text>Envoyer les invitations</Text>
          </Button>
        ))}

      {open && hasFailures && (
        <Button
          variant="secondary"
          disabled={busy}
          aria-label={resend.isPending ? 'Renvoi en cours' : undefined}
          onPress={resendFailed}>
          {resend.isPending && <ActivityIndicator className="text-muted-foreground" />}
          <Text>{resend.isPending ? 'Renvoi en cours' : 'Renvoyer les échecs'}</Text>
        </Button>
      )}

      {notice && (
        <Text
          role={notice.tone === 'error' ? 'alert' : undefined}
          aria-live="polite"
          className={notice.tone === 'error' ? 'font-sans-bold text-danger' : 'font-sans-bold'}>
          {notice.text}
        </Text>
      )}

      {confirmation?.kind === 'full' && (
        <ConfirmPanel
          message={`La battue est complète (${counts.present} places sur ${hunt.max_participants}). ${
            confirmation.promote
              ? `Faire monter ${confirmation.entry.member.name} quand même ?`
              : `Marquer ${confirmation.entry.member.name} présent quand même ?`
          }`}
          confirmLabel={confirmation.promote ? 'Oui, faire monter' : 'Oui, marquer présent'}
          cancelLabel="Non"
          onConfirm={() => record(confirmation.entry, 'present')}
          onCancel={() => setConfirmation(null)}
        />
      )}

      {invitations.length > 0 && (
        <View className="gap-6">
          <AttendanceCounters counts={counts} maxParticipants={hunt.max_participants} />
          {GROUPS.map(({ participation, title }) => (
            <InvitationGroup
              key={participation}
              title={title}
              entries={invitations
                .filter((entry) => entry.participation === participation)
                .sort(participation === 'waiting_list' ? byAnswerTime : byName)}
              actionsFor={actionsFor}
              disabled={setParticipation.isPending}
            />
          ))}
        </View>
      )}
      {invitationsQuery.isError && (
        <Text role="alert" className="font-sans-bold text-danger">
          Impossible de charger les réponses. Tirez vers le bas pour réessayer.
        </Text>
      )}

      {open &&
        (confirmation?.kind === 'cancel' ? (
          <ConfirmPanel
            variant="danger"
            message={`Annuler la battue du ${day} ? Les invités qui n'ont pas répondu NON seront prévenus par SMS et e-mail. Cette action est définitive.`}
            confirmLabel="Oui, annuler la battue"
            cancelLabel="Non, garder la battue"
            onConfirm={cancelHunt}
            onCancel={() => setConfirmation(null)}
          />
        ) : (
          <Button
            variant="danger"
            disabled={busy}
            aria-label={cancel.isPending ? 'Annulation en cours' : undefined}
            onPress={() => {
              setNotice(null);
              setConfirmation({ kind: 'cancel' });
            }}>
            {cancel.isPending && <ActivityIndicator className="text-muted-foreground" />}
            <Text>{cancel.isPending ? 'Annulation en cours' : 'Annuler la battue'}</Text>
          </Button>
        ))}
    </ScrollView>
  );
}
