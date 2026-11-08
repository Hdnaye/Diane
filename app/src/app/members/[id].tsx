import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FieldError } from '@/components/field-error';
import { MemberForm } from '@/components/member-form';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { Member } from '@/data/member-repository';
import {
  useMembers,
  useRemoveMember,
  useSetMemberActive,
  useUpdateMember,
} from '@/data/member-queries';
import { memberFormValues } from '@/lib/member-form';
import { backToMembers } from '@/lib/member-navigation';

const REMOVE_FAILED = "L'adhérent n'a pas pu être supprimé. Vérifiez la connexion, puis réessayez.";
const DEACTIVATE_FAILED =
  "L'adhérent n'a pas pu être mis de côté. Vérifiez la connexion, puis réessayez.";

export default function EditMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const membersQuery = useMembers();
  const removeMember = useRemoveMember();
  const member = membersQuery.data?.find((candidate) => candidate.id === id);

  let content;
  if (membersQuery.isPending) {
    content = <Text className="text-muted-foreground">{"Chargement de l'adhérent…"}</Text>;
  } else if (membersQuery.isError) {
    content = (
      <View className="gap-4">
        <Text role="alert" className="font-sans-bold text-danger">
          {"Impossible de charger l'adhérent. Vérifiez la connexion."}
        </Text>
        <Button variant="secondary" onPress={() => membersQuery.refetch()}>
          <Text>Réessayer</Text>
        </Button>
      </View>
    );
  } else if (!member && (removeMember.isPending || removeMember.isSuccess)) {
    // The list reloads before going back: the member is gone, not "unknown".
    content = <Text className="text-muted-foreground">Suppression…</Text>;
  } else if (!member) {
    content = <Text>{"Cet adhérent n'existe plus."}</Text>;
  } else {
    content = <MemberEditor member={member} onRemove={() => removeMember.mutateAsync(member.id)} />;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-8 px-4 py-6">
      <Stack.Screen options={{ title: "Modifier l'adhérent" }} />
      {content}
    </ScrollView>
  );
}

function MemberEditor({ member, onRemove }: { member: Member; onRemove: () => Promise<unknown> }) {
  const updateMember = useUpdateMember();
  const setActive = useSetMemberActive();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, failureMessage: string) {
    setFailure(undefined);
    setBusy(true);
    try {
      await action();
    } catch {
      setFailure(failureMessage);
      setBusy(false);
      return;
    }
    backToMembers();
  }

  return (
    <>
      <MemberForm
        defaultValues={memberFormValues(member)}
        submitLabel="Enregistrer"
        onSubmit={async (changes) => {
          await updateMember.mutateAsync({ id: member.id, member: changes });
          backToMembers();
        }}
      />
      <View className="gap-4 border-t border-border pt-8">
        {confirming ? (
          <View className="gap-4 rounded-xl border-2 border-danger bg-card p-6">
            <Text variant="large" role="alert">
              Supprimer définitivement {member.name} ? Ses réponses aux battues seront aussi
              supprimées.
            </Text>
            <Button variant="danger" disabled={busy} onPress={() => run(onRemove, REMOVE_FAILED)}>
              <Text>Oui, supprimer</Text>
            </Button>
            {member.active && (
              <>
                <Text className="text-muted-foreground">
                  {"Ou gardez-le dans la liste sans l'inviter aux prochaines battues :"}
                </Text>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    run(
                      () => setActive.mutateAsync({ id: member.id, active: false }),
                      DEACTIVATE_FAILED
                    )
                  }>
                  <Text>Ne plus inviter</Text>
                </Button>
              </>
            )}
            <Button variant="secondary" onPress={() => setConfirming(false)}>
              <Text>Annuler</Text>
            </Button>
          </View>
        ) : (
          <Button variant="secondary" onPress={() => setConfirming(true)}>
            <Text>{"Supprimer l'adhérent"}</Text>
          </Button>
        )}
        <FieldError message={failure} />
      </View>
    </>
  );
}
