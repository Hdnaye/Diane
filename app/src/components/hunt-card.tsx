import { Pressable } from 'react-native';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Hunt } from '@/data/types';
import { formatLongDay, formatTime } from '@/lib/dates';

/**
 * A planned hunt: day in full, meeting time and, when set, the maximum number of places.
 * Pressing it opens the hunt.
 */
export function HuntCard({ hunt, onPress }: { hunt: Hunt; onPress?: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={`Ouvrir la battue du ${formatLongDay(hunt.date)}`}
      disabled={!onPress}
      onPress={onPress}
      className="rounded-xl active:opacity-80">
      <Card>
        <CardHeader>
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
