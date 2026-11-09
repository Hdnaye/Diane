import { Ban, Lock, PencilLine, Send, type LucideIcon } from 'lucide-react-native';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { HuntStatus } from '@/data/hunt-follow-up';

const STATUSES: Record<
  HuntStatus,
  { label: string; icon: LucideIcon; variant: NonNullable<BadgeProps['variant']> }
> = {
  draft: { label: 'Brouillon', icon: PencilLine, variant: 'neutral' },
  // Set by the server before any message leaves, and kept when none does.
  invitations_sent: { label: 'Invitations lancées', icon: Send, variant: 'neutral' },
  closed: { label: 'Terminée', icon: Lock, variant: 'neutral' },
  cancelled: { label: 'Annulée', icon: Ban, variant: 'danger' },
};

/** Status of a hunt: always an icon and a label, never a color alone. */
export function HuntStatusBadge({ status }: { status: HuntStatus }) {
  const { label, icon, variant } = STATUSES[status];
  return (
    <Badge variant={variant}>
      <Icon as={icon} aria-hidden />
      <Text>{label}</Text>
    </Badge>
  );
}
