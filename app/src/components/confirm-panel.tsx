import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type ConfirmPanelProps = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` for an action that cannot be undone. */
  variant?: 'primary' | 'danger';
  /** Without it, only the cancel button is shown (nothing to confirm). */
  onConfirm?: () => void;
  onCancel: () => void;
};

/**
 * A confirmation shown in the page, under the button that asked for it: big buttons, works the
 * same on iOS, Android and the web (React Native's `Alert` does nothing on the web).
 */
export function ConfirmPanel({
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  return (
    <View
      role="alert"
      className={cn(
        'gap-4 rounded-xl border-2 bg-card p-4',
        variant === 'danger' ? 'border-danger' : 'border-primary'
      )}>
      <Text className="font-sans-bold">{message}</Text>
      <View className="gap-3">
        {onConfirm && (
          <Button variant={variant} onPress={onConfirm}>
            <Text>{confirmLabel}</Text>
          </Button>
        )}
        <Button variant="secondary" onPress={onCancel}>
          <Text>{cancelLabel}</Text>
        </Button>
      </View>
    </View>
  );
}
