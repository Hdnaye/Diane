import { userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import EditMemberScreen from '@/app/members/[id]';
import MembersScreen from '@/app/members/index';
import NewMemberScreen from '@/app/members/new';
import { createInMemoryMemberRepository, type Member } from '@/data/member-repository';
import { aMember, renderMemberScreens } from '@/test-utils/member-screens';

const routes = {
  'members/index': MembersScreen,
  'members/new': NewMemberScreen,
  'members/[id]': EditMemberScreen,
};

const JEAN = aMember({ id: 'm1', name: 'Jean Exemple', phone: '+33639980001' });

const NAME = 'Nom';
const PHONE = 'Téléphone (facultatif)';
const EMAIL = 'E-mail (facultatif)';
const ACTIVE = 'Inviter aux battues';

async function openNewMemberForm(
  members: Member[] = [JEAN],
  repository = createInMemoryMemberRepository(members)
) {
  const user = userEvent.setup();
  await renderMemberScreens(routes, { repository });
  await user.press(await screen.findByRole('button', { name: 'Ajouter un adhérent' }));
  await screen.findByLabelText(NAME);
  return { user, repository };
}

describe('NewMemberScreen', () => {
  it('asks for a name, a phone number and an e-mail, with suited keyboards', async () => {
    await openNewMemberForm();

    expect(screen.getByLabelText(NAME)).toBeOnTheScreen();
    expect(screen.getByLabelText(PHONE)).toHaveProp('keyboardType', 'phone-pad');
    expect(screen.getByLabelText(EMAIL)).toHaveProp('keyboardType', 'email-address');
    expect(screen.getByRole('checkbox', { name: ACTIVE })).toBeChecked();
  });

  it('shows every missing information at once and adds nobody', async () => {
    const { user, repository } = await openNewMemberForm([]);

    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(await screen.findByText("Indiquez le nom de l'adhérent.")).toBeOnTheScreen();
    expect(screen.getByText('Indiquez au moins un téléphone ou un e-mail.')).toBeOnTheScreen();
    expect(await repository.list()).toEqual([]);
  });

  it('shows an invalid phone number and an invalid e-mail at once', async () => {
    const { user } = await openNewMemberForm();

    await user.type(screen.getByLabelText(NAME), 'Paul Essai');
    await user.type(screen.getByLabelText(PHONE), '06 39 98');
    await user.type(screen.getByLabelText(EMAIL), 'paul@');
    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(
      await screen.findByText('Numéro de téléphone invalide. Exemple : 06 39 98 00 01.')
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Adresse e-mail invalide. Exemple : prenom.nom@example.com.')
    ).toBeOnTheScreen();
  });

  it('adds a member with a phone number typed freely, then shows the list', async () => {
    const { user, repository } = await openNewMemberForm();

    await user.type(screen.getByLabelText(NAME), 'Paul Essai');
    await user.type(screen.getByLabelText(PHONE), '06.39.98.00.05');
    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(await screen.findByRole('heading', { name: 'Paul Essai' })).toBeOnTheScreen();
    expect(screen.getByText('06 39 98 00 05')).toBeOnTheScreen();
    expect(screen).toHavePathname('/members');
    expect(await repository.list()).toContainEqual(
      expect.objectContaining({ name: 'Paul Essai', phone: '+33639980005', active: true })
    );
  });

  it('adds a member who is not invited yet', async () => {
    const { user, repository } = await openNewMemberForm();

    await user.type(screen.getByLabelText(NAME), 'Paul Essai');
    await user.type(screen.getByLabelText(EMAIL), 'paul@example.com');
    await user.press(screen.getByRole('checkbox', { name: ACTIVE }));
    expect(screen.getByRole('checkbox', { name: ACTIVE })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(await screen.findByText('Inactif')).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual(
      expect.objectContaining({ email: 'paul@example.com', active: false })
    );
  });

  it('shows the refusal of the server next to the field', async () => {
    const { user } = await openNewMemberForm();

    await user.type(screen.getByLabelText(NAME), 'Paul Essai');
    await user.type(screen.getByLabelText(PHONE), '06 39 98 00 01');
    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(
      await screen.findByText("Ce numéro de téléphone est déjà celui d'un autre adhérent.")
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(PHONE)).toHaveProp('aria-invalid', true);
    expect(screen).toHavePathname('/members/new');
  });

  it('says when the member could not be added for another reason', async () => {
    const repository = createInMemoryMemberRepository([JEAN]);
    repository.create = () => Promise.reject(new Error('network down'));
    const { user } = await openNewMemberForm([], repository);

    await user.type(screen.getByLabelText(NAME), 'Paul Essai');
    await user.type(screen.getByLabelText(EMAIL), 'paul@example.com');
    await user.press(screen.getByRole('button', { name: "Ajouter l'adhérent" }));

    expect(
      await screen.findByText(
        "L'adhérent n'a pas pu être enregistré. Vérifiez la connexion, puis réessayez."
      )
    ).toBeOnTheScreen();
  });
});

describe('EditMemberScreen', () => {
  const EMILE = aMember({
    id: 'm2',
    name: 'Émile Fictif',
    email: 'emile@example.com',
    active: false,
  });

  async function openMember(name: string, members: Member[] = [JEAN, EMILE]) {
    const user = userEvent.setup();
    const { repository } = await renderMemberScreens(routes, { members });
    await user.press(await screen.findByRole('button', { name: new RegExp(name) }));
    await screen.findByLabelText(NAME);
    return { user, repository };
  }

  it('shows the member as stored, the phone number written the usual way', async () => {
    await openMember('Jean Exemple');

    expect(screen.getByLabelText(NAME)).toHaveDisplayValue('Jean Exemple');
    expect(screen.getByLabelText(PHONE)).toHaveDisplayValue('06 39 98 00 01');
    expect(screen.getByLabelText(EMAIL)).toHaveDisplayValue('');
    expect(screen.getByRole('checkbox', { name: ACTIVE })).toBeChecked();
  });

  it('saves the changes, then shows the list', async () => {
    const { user, repository } = await openMember('Jean Exemple');

    await user.clear(screen.getByLabelText(NAME));
    await user.type(screen.getByLabelText(NAME), 'Jean Exemple fils');
    await user.type(screen.getByLabelText(EMAIL), 'jean@example.com');
    await user.press(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('heading', { name: 'Jean Exemple fils' })).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual({
      ...JEAN,
      name: 'Jean Exemple fils',
      email: 'jean@example.com',
    });
  });

  it('says when the member no longer exists', async () => {
    await renderMemberScreens(routes, { members: [JEAN], initialUrl: '/members/unknown' });

    expect(await screen.findByText("Cet adhérent n'existe plus.")).toBeOnTheScreen();
  });

  it('deletes the member only once the deletion is confirmed', async () => {
    const { user, repository } = await openMember('Jean Exemple');

    await user.press(screen.getByRole('button', { name: "Supprimer l'adhérent" }));

    expect(
      screen.getByText(
        'Supprimer définitivement Jean Exemple ? Ses réponses aux battues seront aussi supprimées.'
      )
    ).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual(JEAN);

    await user.press(screen.getByRole('button', { name: 'Oui, supprimer' }));

    expect(await screen.findByText('1 adhérent, dont 1 inactif')).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: 'Jean Exemple' })).not.toBeOnTheScreen();
    expect(await repository.list()).toEqual([EMILE]);
  });

  it('keeps the member when the deletion is cancelled', async () => {
    const { user, repository } = await openMember('Jean Exemple');

    await user.press(screen.getByRole('button', { name: "Supprimer l'adhérent" }));
    await user.press(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText(/Supprimer définitivement/)).not.toBeOnTheScreen();
    expect(await repository.list()).toContainEqual(JEAN);
  });

  it('offers to stop inviting the member instead of deleting it', async () => {
    const { user, repository } = await openMember('Jean Exemple');

    await user.press(screen.getByRole('button', { name: "Supprimer l'adhérent" }));
    await user.press(screen.getByRole('button', { name: 'Ne plus inviter' }));

    expect(await screen.findByText('2 adhérents, dont 2 inactifs')).toBeOnTheScreen();
    expect(await repository.list()).toContainEqual({ ...JEAN, active: false });
  });

  it('does not offer to stop inviting a member already inactive', async () => {
    const { user } = await openMember('Émile Fictif');

    expect(screen.getByRole('checkbox', { name: ACTIVE })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: "Supprimer l'adhérent" }));

    expect(
      screen.getByText(
        'Supprimer définitivement Émile Fictif ? Ses réponses aux battues seront aussi supprimées.'
      )
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ne plus inviter' })).not.toBeOnTheScreen();
  });

  it('says when the member could not be deleted', async () => {
    const repository = createInMemoryMemberRepository([JEAN]);
    repository.remove = () => Promise.reject(new Error('network down'));
    const user = userEvent.setup();
    await renderMemberScreens(routes, { repository });
    await user.press(await screen.findByRole('button', { name: /Jean Exemple/ }));

    await user.press(await screen.findByRole('button', { name: "Supprimer l'adhérent" }));
    await user.press(screen.getByRole('button', { name: 'Oui, supprimer' }));

    expect(
      await screen.findByText(
        "L'adhérent n'a pas pu être supprimé. Vérifiez la connexion, puis réessayez."
      )
    ).toBeOnTheScreen();
  });
});
