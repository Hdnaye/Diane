import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * A large checkbox: the whole row, box and label, is a single touch target whose accessible
 * name is the visible label. Built on Pressable rather than a native switch, which renders
 * differently on iOS, Android and the web.
 */
export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      role="checkbox"
      aria-checked={checked}
      onPress={() => onChange(!checked)}
      className="min-h-touch flex-row items-center gap-4 rounded-lg web:outline-none web:focus-visible:ring-4 web:focus-visible:ring-ring">
      <View
        className={cn(
          'size-touch-min items-center justify-center rounded-md border-2',
          checked ? 'border-primary bg-primary' : 'border-input bg-card'
        )}>
        {checked && <Icon as={Check} className="size-8 text-primary-foreground" aria-hidden />}
      </View>
      <Text variant="large" className="flex-1">
        {label}
      </Text>
    </Pressable>
  );
}
