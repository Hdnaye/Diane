import { Pressable } from 'react-native';

import { HuntStatusBadge } from '@/components/hunt-status-badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Hunt } from '@/data/types';
import { formatLongDay, formatTime } from '@/lib/dates';

/**
 * A planned hunt: day in full, meeting time and, when set, the maximum number of places. A cancelled
 * hunt stays listed (its day stays taken) and says so. Pressing it opens the hunt.
 */
export function HuntCard({ hunt, onPress }: { hunt: Hunt; onPress?: () => void }) {
  const cancelled = hunt.status === 'cancelled';
  return (
    <Pressable
      role="button"
      aria-label={`Ouvrir la battue du ${formatLongDay(hunt.date)}${cancelled ? ', annulée' : ''}`}
      disabled={!onPress}
      onPress={onPress}
      className="rounded-xl active:opacity-80">
      <Card>
        <CardHeader>
          {cancelled && <HuntStatusBadge status="cancelled" />}
          <CardTitle>{formatLongDay(hunt.date)}</CardTitle>
          <CardDescription className="text-base text-foreground">
            Rendez-vous à {formatTime(hunt.meeting_time)}
          </CardDescription>
          {hunt.max_participants !== null && (
            <CardDescription className="text-base">
              {hunt.max_participants} places au maximum
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    </Pressable>
  );
}
