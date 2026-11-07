import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export type Step = {
  /** Short visible text, e.g. "− 1 h". */
  text: string;
  /** Full name for screen readers, e.g. "Rendez-vous : une heure plus tôt". */
  label: string;
  onPress: () => void;
};

/**
 * A value changed with large buttons instead of a native picker: works the same in Expo Go
 * (iOS, Android) and on the web, and is easy to use for people not at ease with phones.
 */
export function StepperField({
  label,
  value,
  steps,
}: {
  label: string;
  value: string;
  /** Pairs of opposite steps (earlier / later), shown one pair per row. */
  steps: [Step, Step][];
}) {
  return (
    <View className="gap-3">
      <Text variant="large">{label}</Text>
      <Text className="rounded-lg border border-border bg-card px-4 py-3 text-center font-sans-bold text-xl">
        {value}
      </Text>
      {steps.map((pair) => (
        <View key={pair[0].label} className="flex-row gap-2">
          {pair.map((step) => (
            <Button
              key={step.label}
              variant="secondary"
              className="flex-1"
              aria-label={step.label}
              onPress={step.onPress}>
              <Text>{step.text}</Text>
            </Button>
          ))}
        </View>
      ))}
    </View>
  );
}
