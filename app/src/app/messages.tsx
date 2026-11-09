import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { OpenInvitation, ReviewItem } from '@/data/hunt-follow-up';
import {
  useApplyReviewAnswer,
  useOpenInvitations,
  useResolveReviewItem,
  useReviewItems,
} from '@/data/hunt-follow-up-queries';
import { formatLongDay } from '@/lib/dates';
import { formatPhone, reviewReason } from '@/lib/follow-up-text';
import { formatParisDateTime, parisDay } from '@/lib/paris-time';
import { cn } from '@/lib/utils';

type Notice = { tone: 'success' | 'error'; text: string };

/** SMS replies the server could not apply: the organizer applies or dismisses them. */
export default function MessagesScreen() {
  const items = useReviewItems();
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-4 py-6">
      <Stack.Screen options={{ title: 'Messages à vérifier' }} />
      <Text variant="h2">Messages à vérifier</Text>
      {notice && (
        <Text
          role={notice.tone === 'error' ? 'alert' : undefined}
          aria-live="polite"
          className={cn('font-sans-bold', notice.tone === 'error' && 'text-danger')}>
          {notice.text}
        </Text>
      )}
      {items.isPending ? (
        <Text className="text-muted-foreground">Chargement des messages…</Text>
      ) : items.isError ? (
        <View className="gap-4">
          <Text role="alert" className="font-sans-bold text-danger">
            Impossible de charger les messages. Vérifiez la connexion.
          </Text>
          <Button variant="secondary" onPress={() => items.refetch()}>
            <Text>Réessayer</Text>
          </Button>
        </View>
      ) : items.data.length === 0 ? (
        <Text className="text-muted-foreground">Aucun message à vérifier.</Text>
      ) : (
        items.data.map((item) => <ReviewCard key={item.id} item={item} onNotice={setNotice} />)
      )}
    </ScrollView>
  );
}

function ReviewCard({ item, onNotice }: { item: ReviewItem; onNotice: (notice: Notice) => void }) {
  const sender = item.member?.name || formatPhone(item.from_phone);
  const resolve = useResolveReviewItem();
  const busy = resolve.isPending;

  function markHandled() {
    resolve.mutate(item.id, {
      onSuccess: () => onNotice({ tone: 'success', text: 'Message marqué comme traité.' }),
      onError: () =>
        onNotice({
          tone: 'error',
          text: "Le message n'a pas pu être marqué comme traité. Vérifiez la connexion.",
        }),
    });
  }

  return (
    <View
      aria-label={`Message de ${sender}`}
      className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text variant="large">{sender}</Text>
      <Text className="text-muted-foreground">
        {formatParisDateTime(new Date(item.received_at))}
      </Text>
      <Text>« {item.body} »</Text>
      <Text className="font-sans-bold text-warning">{reviewReason(item.reason)}</Text>
      {item.member && (
        <ApplyAnswer item={item} memberId={item.member.id} sender={sender} onNotice={onNotice} />
      )}
      <Button
        variant="secondary"
        disabled={busy}
        aria-label={`Marquer comme traité : ${sender}`}
        onPress={markHandled}>
        <Text>Marquer comme traité</Text>
      </Button>
    </View>
  );
}

function ApplyAnswer({
  item,
  memberId,
  sender,
  onNotice,
}: {
  item: ReviewItem;
  memberId: string;
  sender: string;
  onNotice: (notice: Notice) => void;
}) {
  const [today] = useState(() => parisDay(new Date()));
  const open = useOpenInvitations(memberId, today);
  const apply = useApplyReviewAnswer();
  const [chosenId, setChosenId] = useState<string | null>(null);

  if (open.isPending) {
    return <Text className="text-muted-foreground">Recherche des battues ouvertes…</Text>;
  }
  if (open.isError) {
    return (
      <Text role="alert" className="text-danger">
        Impossible de charger les battues de cet adhérent.
      </Text>
    );
  }
  const invitations = open.data;
  if (invitations.length === 0) {
    return (
      <Text className="text-muted-foreground">
        Pas de battue ouverte à laquelle appliquer la réponse.
      </Text>
    );
  }
  const chosen: OpenInvitation | undefined =
    invitations.length === 1
      ? invitations[0]
      : invitations.find((invitation) => invitation.id === chosenId);

  function applyAnswer(answer: 'yes' | 'no') {
    if (!chosen) return;
    const day = formatLongDay(chosen.huntDate);
    const word = answer === 'yes' ? 'OUI' : 'NON';
    apply.mutate(
      { itemId: item.id, invitation: { id: chosen.id, huntId: chosen.huntId }, answer },
      {
        onSuccess: () =>
          onNotice({ tone: 'success', text: `Réponse ${word} appliquée à la battue du ${day}.` }),
        onError: () =>
          onNotice({
            tone: 'error',
            text: "La réponse n'a pas pu être appliquée. Vérifiez la connexion, puis réessayez.",
          }),
      }
    );
  }

  return (
    <View className="gap-3">
      {invitations.length === 1 ? (
        <Text>Battue du {formatLongDay(invitations[0].huntDate)}</Text>
      ) : (
        <View role="radiogroup" aria-label="Battue concernée" className="gap-2">
          <Text>Battue concernée :</Text>
          {invitations.map((invitation) => {
            const selected = invitation.id === chosenId;
            return (
              <Pressable
                key={invitation.id}
                role="radio"
                aria-checked={selected}
                onPress={() => setChosenId(invitation.id)}
                className={cn(
                  'min-h-touch-min justify-center rounded-lg border-2 px-4',
                  selected ? 'border-primary bg-accent-light' : 'border-border bg-card'
                )}>
                <Text className={cn(selected && 'font-sans-bold')}>
                  {formatLongDay(invitation.huntDate)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View className="flex-row gap-3">
        {(['yes', 'no'] as const).map((answer) => {
          const word = answer === 'yes' ? 'OUI' : 'NON';
          return (
            <Button
              key={answer}
              className="flex-1"
              variant={answer === 'yes' ? 'primary' : 'secondary'}
              disabled={!chosen || apply.isPending}
              aria-label={`Appliquer ${word} : ${sender}`}
              onPress={() => applyAnswer(answer)}>
              <Text>Appliquer {word}</Text>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
