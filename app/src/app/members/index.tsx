import { router, Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useServerConnection } from '@/data/hunt-queries';
import type { Member } from '@/data/member-repository';
import { useMembers } from '@/data/member-queries';

export default function MembersScreen() {
  const connection = useServerConnection();
  const membersQuery = useMembers();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-4 py-6">
      <Stack.Screen options={{ title: 'Adhérents' }} />
      {connection.isError && (
        <View className="gap-4">
          <Text role="alert" className="font-sans-bold text-danger">
            Connexion au serveur impossible. Vérifiez la connexion internet, puis réessayez.
          </Text>
          <Button variant="secondary" onPress={() => connection.refetch()}>
            <Text>Réessayer</Text>
          </Button>
        </View>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={connection.isError}
        onPress={() => router.push('/members/new')}>
        <Text>Ajouter un adhérent</Text>
      </Button>
      {!connection.isError &&
        (connection.isPending ? (
          <Text className="text-muted-foreground">Connexion au serveur…</Text>
        ) : membersQuery.isPending ? (
          <Text className="text-muted-foreground">Chargement des adhérents…</Text>
        ) : membersQuery.isError ? (
          <View className="gap-4">
            <Text role="alert" className="font-sans-bold text-danger">
              Impossible de charger les adhérents. Vérifiez la connexion.
            </Text>
            <Button variant="secondary" onPress={() => membersQuery.refetch()}>
              <Text>Réessayer</Text>
            </Button>
          </View>
        ) : membersQuery.data.length === 0 ? (
          <Text className="text-muted-foreground">
            {"Aucun adhérent pour l'instant. Ajoutez le premier."}
          </Text>
        ) : (
          <>
            <Text variant="large">{countLabel(membersQuery.data)}</Text>
            {membersQuery.data.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onPress={() => router.push(`/members/${member.id}`)}
              />
            ))}
          </>
        ))}
    </ScrollView>
  );
}

/** "3 adhérents, dont 1 inactif". */
function countLabel(members: Member[]): string {
  const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;
  const inactive = members.filter((member) => !member.active).length;
  const total = plural(members.length, 'adhérent');
  return inactive > 0 ? `${total}, dont ${plural(inactive, 'inactif')}` : total;
}
