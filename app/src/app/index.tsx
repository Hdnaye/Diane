import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HuntCalendar } from '@/components/hunt-calendar';
import { HuntCard } from '@/components/hunt-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useHunts } from '@/data/hunt-queries';
import { toDateKey } from '@/lib/dates';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const huntsQuery = useHunts();
  const hunts = huntsQuery.data ?? [];
  const [selectedDate, setSelectedDate] = useState<string>();

  const today = toDateKey(new Date());
  const upcoming = hunts.filter((hunt) => hunt.date >= today);

  function createHunt() {
    router.push(selectedDate ? `/hunts/new?date=${selectedDate}` : '/hunts/new');
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pb-10"
      style={{ paddingTop: insets.top }}>
      <Text variant="h1" className="mt-6">
        Diane
      </Text>
      <View className="overflow-hidden rounded-xl border border-border bg-card py-2">
        <HuntCalendar
          huntDates={hunts.map((hunt) => hunt.date)}
          selectedDate={selectedDate}
          minDate={today}
          onSelectDate={setSelectedDate}
        />
      </View>
      <Button variant="primary" size="lg" className="w-full" onPress={createHunt}>
        <Text>Créer une battue</Text>
      </Button>
      <Text variant="h2">Prochaines battues</Text>
      {huntsQuery.isPending ? (
        <Text className="text-muted-foreground">Chargement des battues…</Text>
      ) : huntsQuery.isError ? (
        <View className="gap-4">
          <Text role="alert" className="font-sans-bold text-danger">
            Impossible de charger les battues. Vérifiez la connexion.
          </Text>
          <Button variant="secondary" onPress={() => huntsQuery.refetch()}>
            <Text>Réessayer</Text>
          </Button>
        </View>
      ) : upcoming.length === 0 ? (
        <Text className="text-muted-foreground">Aucune battue prévue.</Text>
      ) : (
        upcoming.map((hunt) => <HuntCard key={hunt.id} hunt={hunt} />)
      )}
    </ScrollView>
  );
}
