import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { MemberForm } from '@/components/member-form';
import { useCreateMember } from '@/data/member-queries';
import { emptyMemberFormValues } from '@/lib/member-form';
import { backToMembers } from '@/lib/member-navigation';

export default function NewMemberScreen() {
  const createMember = useCreateMember();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 py-6">
      <Stack.Screen options={{ title: 'Nouvel adhérent' }} />
      <MemberForm
        defaultValues={emptyMemberFormValues}
        submitLabel="Ajouter l'adhérent"
        onSubmit={async (member) => {
          await createMember.mutateAsync(member);
          backToMembers();
        }}
      />
    </ScrollView>
  );
}
