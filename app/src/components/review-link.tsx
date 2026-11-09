import { router } from 'expo-router';
import { MessageSquareWarning } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReviewItems } from '@/data/hunt-follow-up-queries';

/** A discreet link to the SMS to check, with their number; nothing when there is none. */
export function ReviewLink() {
  const { data: items = [] } = useReviewItems();
  if (items.length === 0) {
    return null;
  }
  const label = `Messages à vérifier (${items.length})`;
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={() => router.push('/messages')}
      className="min-h-touch-min flex-row items-center justify-center gap-2 self-center px-4">
      <Icon as={MessageSquareWarning} className="text-primary" aria-hidden />
      <Text className="font-sans-bold text-primary underline">{label}</Text>
    </Pressable>
  );
}
