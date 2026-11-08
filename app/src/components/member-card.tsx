import { BellOff } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Member } from '@/data/member-repository';
import { formatFrenchPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * A member in the list: name in large, phone number written the usual way and e-mail, and a
 * badge (icon + label) when the member is no longer invited. Pressing it opens the member.
 */
export function MemberCard({ member, onPress }: { member: Member; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      onPress={onPress}
      className={cn(
        'gap-2 rounded-xl border border-border bg-card px-6 py-5 active:bg-muted',
        'web:outline-none web:focus-visible:ring-4 web:focus-visible:ring-ring'
      )}>
      <Text variant="h3">{member.name}</Text>
      {member.phone !== '' && <Text>{formatFrenchPhone(member.phone)}</Text>}
      {member.email !== '' && <Text>{member.email}</Text>}
      {!member.active && (
        <View className="pt-1">
          <Badge variant="neutral">
            <Icon as={BellOff} testID="inactive-badge-icon" aria-hidden />
            <Text>Inactif</Text>
          </Badge>
        </View>
      )}
    </Pressable>
  );
}
