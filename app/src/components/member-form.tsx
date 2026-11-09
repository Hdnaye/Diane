import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { View, type TextInputProps } from 'react-native';

import { CheckboxField } from '@/components/checkbox-field';
import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  MemberValidationError,
  type MemberField,
  type MemberInput,
} from '@/data/member-repository';
import { memberFormSchema, type MemberFormValues } from '@/lib/member-form';

const SAVE_FAILED = "L'adhérent n'a pas pu être enregistré. Vérifiez la connexion, puis réessayez.";

type TextField = { name: MemberField; label: string; hint?: string; input: TextInputProps };

const TEXT_FIELDS: TextField[] = [
  {
    name: 'name',
    label: 'Nom',
    hint: 'Prénom et nom, tels que vous les dites.',
    input: { autoCapitalize: 'words', autoComplete: 'off', autoCorrect: false },
  },
  {
    name: 'phone',
    label: 'Téléphone (facultatif)',
    hint: 'Pour les invitations par SMS. Exemple : 06 39 98 00 01.',
    // `autoComplete` off: the phone would suggest the organizer's own number.
    input: { keyboardType: 'phone-pad', inputMode: 'tel', autoComplete: 'off' },
  },
  {
    name: 'email',
    label: 'E-mail (facultatif)',
    hint: 'Pour les invitations par e-mail.',
    input: {
      keyboardType: 'email-address',
      inputMode: 'email',
      autoCapitalize: 'none',
      autoComplete: 'off',
      autoCorrect: false,
    },
  },
];

/**
 * Adds or changes a member. `onSubmit` may reject with a `MemberValidationError`: its messages
 * are shown under the fields; any other error shows a general message.
 */
export function MemberForm({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: MemberFormValues;
  submitLabel: string;
  onSubmit: (member: MemberInput) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues, unknown, MemberInput>({
    defaultValues,
    resolver: zodResolver(memberFormSchema),
  });

  const submit = handleSubmit(async (member) => {
    try {
      await onSubmit(member);
    } catch (error) {
      if (error instanceof MemberValidationError) {
        for (const [field, message] of Object.entries(error.fields)) {
          setError(field as FieldPath<MemberFormValues>, { message });
        }
        return;
      }
      setError('root', { message: SAVE_FAILED });
    }
  });

  return (
    <View className="gap-6">
      {TEXT_FIELDS.map(({ name, label, hint, input }) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field: { value, onChange, onBlur } }) => (
            <View className="gap-2">
              <Text variant="large">{label}</Text>
              {hint && <Text className="text-muted-foreground">{hint}</Text>}
              <Input
                aria-label={label}
                aria-invalid={Boolean(errors[name])}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                {...input}
              />
              <FieldError message={errors[name]?.message} />
            </View>
          )}
        />
      ))}
      <Controller
        control={control}
        name="active"
        render={({ field: { value, onChange } }) => (
          <View className="gap-2">
            <CheckboxField label="Inviter aux battues" checked={value} onChange={onChange} />
            <Text className="text-muted-foreground">
              Décochez pour ne plus inviter cet adhérent, sans le supprimer.
            </Text>
          </View>
        )}
      />
      <FieldError message={errors.root?.message} />
      <Button size="lg" className="w-full" disabled={isSubmitting} onPress={() => submit()}>
        <Text>{submitLabel}</Text>
      </Button>
    </View>
  );
}
