import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Hunt } from '@/data/types';
import { formatLongDay, formatTime } from '@/lib/dates';

/** A planned hunt: day in full, meeting time and, when set, the maximum number of places. */
export function HuntCard({ hunt }: { hunt: Hunt }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{formatLongDay(hunt.date)}</CardTitle>
        <CardDescription className="text-base text-foreground">
          Rendez-vous à {formatTime(hunt.meetingTime)}
        </CardDescription>
        {hunt.maxParticipants !== null && (
          <CardDescription className="text-base">
            {hunt.maxParticipants} places au maximum
          </CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
