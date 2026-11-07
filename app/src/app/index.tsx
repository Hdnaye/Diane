import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-8 bg-background px-6">
      <Text variant="h1">Diane</Text>
      <Button size="lg" className="w-full">
        <Text>Créer une battue</Text>
      </Button>
    </View>
  );
}
