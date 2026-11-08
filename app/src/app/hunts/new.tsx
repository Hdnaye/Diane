import { zodResolver } from '@hookform/resolvers/zod';
import { addHours } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { ScrollView, View } from 'react-native';

import { HuntCalendar } from '@/components/hunt-calendar';
import { StepperField } from '@/components/stepper-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { HuntDayTakenError } from '@/data/hunt-repository';
import { useCreateHunt, useHunts } from '@/data/hunt-queries';
import type { NewHunt } from '@/data/types';
import { formatLongDay, formatTime, shiftTime } from '@/lib/dates';
import {
  createHuntFormSchema,
  defaultHuntFormValues,
  defaultResponseDeadline,
  messages,
  type HuntFormValues,
} from '@/lib/hunt-form';
import { formatParisDateTime, parisDay, shiftParisDays } from '@/lib/paris-time';

const MAX_PARTICIPANTS_LABEL = 'Nombre maximum de participants (facultatif)';

export default function NewHuntScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { data: hunts = [] } = useHunts();
  const createHunt = useCreateHunt();
  const [now] = useState(() => new Date());

  // The schema depends on the hunts already planned and on the time of the submission
  // (react-hook-form uses the resolver of the latest render).
  const takenDates = hunts.map((hunt) => hunt.date);
  const resolver: Resolver<HuntFormValues, unknown, NewHunt> = (values, context, options) =>
    zodResolver(createHuntFormSchema({ takenDates, now: new Date() }))(values, context, options);

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HuntFormValues, unknown, NewHunt>({
    defaultValues: defaultHuntFormValues(now, params.date),
    resolver,
  });

  // Until the organizer changes the deadline by hand, it follows the chosen day and time.
  const [deadlineEdited, setDeadlineEdited] = useState(false);
  function followDefaultDeadline(change: Partial<Pick<HuntFormValues, 'date' | 'meetingTime'>>) {
    if (deadlineEdited) {
      return;
    }
    const { date, meetingTime } = { ...getValues(), ...change };
    setValue('responseDeadline', defaultResponseDeadline(now, date, meetingTime));
  }

  const onSubmit = handleSubmit(async (hunt) => {
    try {
      await createHunt.mutateAsync(hunt);
    } catch (error) {
      if (error instanceof HuntDayTakenError) {
        setError('date', { message: messages.dateTaken(error.date) });
        return;
      }
      setError('root', { message: "La battue n'a pas pu être créée. Réessayez." });
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-8 px-4 py-6">
      <Stack.Screen options={{ title: 'Nouvelle battue' }} />

      <Controller
        control={control}
        name="date"
        render={({ field: { value, onChange } }) => (
          <View className="gap-3">
            <Text variant="large">Jour de la battue</Text>
            <View className="overflow-hidden rounded-xl border border-border bg-card py-2">
              <HuntCalendar
                huntDates={takenDates}
                selectedDate={value || undefined}
                minDate={parisDay(now)}
                onSelectDate={(date) => {
                  onChange(date);
                  followDefaultDeadline({ date });
                }}
              />
            </View>
            <Text>{value ? `Jour choisi : ${formatLongDay(value)}` : 'Aucun jour choisi'}</Text>
            <FieldError message={errors.date?.message} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="meetingTime"
        render={({ field: { value, onChange: setTime } }) => {
          const onChange = (meetingTime: string) => {
            setTime(meetingTime);
            followDefaultDeadline({ meetingTime });
          };
          return (
            <StepperField
              label="Heure de rendez-vous"
              value={formatTime(value)}
              steps={[
                [
                  {
                    text: '− 1 h',
                    label: 'rendez-vous une heure plus tôt',
                    onPress: () => onChange(shiftTime(value, -60)),
                  },
                  {
                    text: '+ 1 h',
                    label: 'rendez-vous une heure plus tard',
                    onPress: () => onChange(shiftTime(value, 60)),
                  },
                ],
                [
                  {
                    text: '− 15 min',
                    label: 'rendez-vous 15 minutes plus tôt',
                    onPress: () => onChange(shiftTime(value, -15)),
                  },
                  {
                    text: '+ 15 min',
                    label: 'rendez-vous 15 minutes plus tard',
                    onPress: () => onChange(shiftTime(value, 15)),
                  },
                ],
              ]}
            />
          );
        }}
      />

      <Controller
        control={control}
        name="maxParticipants"
        render={({ field: { value, onChange, onBlur } }) => (
          <View className="gap-3">
            <Text variant="large">{MAX_PARTICIPANTS_LABEL}</Text>
            <Input
              aria-label={MAX_PARTICIPANTS_LABEL}
              aria-invalid={Boolean(errors.maxParticipants)}
              keyboardType="number-pad"
              placeholder="Sans limite"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
            />
            <FieldError message={errors.maxParticipants?.message} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="responseDeadline"
        render={({ field: { value, onChange: setDeadline } }) => {
          const onChange = (deadline: Date) => {
            setDeadlineEdited(true);
            setDeadline(deadline);
          };
          return (
            <View className="gap-3">
              <StepperField
                label="Date limite de réponse"
                value={formatParisDateTime(value)}
                steps={[
                  [
                    {
                      text: '− 1 jour',
                      label: 'date limite un jour plus tôt',
                      onPress: () => onChange(shiftParisDays(value, -1)),
                    },
                    {
                      text: '+ 1 jour',
                      label: 'date limite un jour plus tard',
                      onPress: () => onChange(shiftParisDays(value, 1)),
                    },
                  ],
                  [
                    {
                      text: '− 1 h',
                      label: 'date limite une heure plus tôt',
                      onPress: () => onChange(addHours(value, -1)),
                    },
                    {
                      text: '+ 1 h',
                      label: 'date limite une heure plus tard',
                      onPress: () => onChange(addHours(value, 1)),
                    },
                  ],
                ]}
              />
              <FieldError message={errors.responseDeadline?.message} />
            </View>
          );
        }}
      />

      <FieldError message={errors.root?.message} />
      <Button size="lg" className="w-full" disabled={isSubmitting} onPress={() => onSubmit()}>
        <Text>Créer la battue</Text>
      </Button>
    </ScrollView>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <Text role="alert" className="font-sans-bold text-danger">
      {message}
    </Text>
  );
}
