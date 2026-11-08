import { userEvent } from '@testing-library/react-native';
import { screen, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import MembersScreen from '@/app/members/index';
import type { Member } from '@/data/member-repository';
import { ServerConfigMissingError } from '@/data/server-connection';
import { aMember, failingMemberRepository, renderMemberScreens } from '@/test-utils/member-screens';

const MEMBERS = [
  aMember({ id: 'm1', name: 'Jean Exemple', phone: '+33639980001' }),
  aMember({
    id: 'm2',
    name: 'Émile Fictif',
    phone: '+33639980002',
    email: 'emile@example.com',
    active: false,
  }),
  aMember({ id: 'm3', name: 'Alain Test', email: 'alain@example.com' }),
];

function NewMemberStub() {
  return <Text>{"Formulaire d'ajout"}</Text>;
}
function EditMemberStub() {
  return <Text>Formulaire de modification</Text>;
}

const routes = {
  'members/index': MembersScreen,
  'members/new': NewMemberStub,
  'members/[id]': EditMemberStub,
};

describe('MembersScreen', () => {
  it('lists the members by name, with their contacts written the usual way', async () => {
    await renderMemberScreens(routes, { members: MEMBERS });

    const names = await screen.findAllByRole('heading', { name: /Test|Fictif|Exemple/ });
    expect(names.map((name) => name.props.children)).toEqual([
      'Alain Test',
      'Émile Fictif',
      'Jean Exemple',
    ]);
    expect(screen.getByText('06 39 98 00 01')).toBeOnTheScreen();
    expect(screen.getByText('06 39 98 00 02')).toBeOnTheScreen();
    expect(screen.getByText('emile@example.com')).toBeOnTheScreen();
    expect(screen.getByText('alain@example.com')).toBeOnTheScreen();
  });

  it('counts the members and marks the ones no longer invited, with an icon and a label', async () => {
    await renderMemberScreens(routes, { members: MEMBERS });

    expect(await screen.findByText('3 adhérents, dont 1 inactif')).toBeOnTheScreen();
    const emile = screen.getByRole('button', { name: /Émile Fictif/ });
    expect(within(emile).getByText('Inactif')).toBeOnTheScreen();
    expect(
      within(emile).getByTestId('inactive-badge-icon', { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(screen.getAllByText('Inactif')).toHaveLength(1);
  });

  it('counts a single member in the singular', async () => {
    await renderMemberScreens(routes, { members: [MEMBERS[0]] });

    expect(await screen.findByText('1 adhérent')).toBeOnTheScreen();
  });

  it('says when there is no member yet', async () => {
    await renderMemberScreens(routes);

    expect(
      await screen.findByText("Aucun adhérent pour l'instant. Ajoutez le premier.")
    ).toBeOnTheScreen();
  });

  it('says the members are loading, without claiming there is none', async () => {
    const repository = failingMemberRepository({ list: () => new Promise<Member[]>(() => {}) });
    await renderMemberScreens(routes, { repository });

    expect(await screen.findByText('Chargement des adhérents…')).toBeOnTheScreen();
    expect(screen.queryByText(/Aucun adhérent/)).not.toBeOnTheScreen();
  });

  it('says when the members cannot be loaded and lets the organizer retry', async () => {
    const user = userEvent.setup();
    const repository = failingMemberRepository({
      list: jest
        .fn<Promise<Member[]>, []>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue([MEMBERS[0]]),
    });
    await renderMemberScreens(routes, { repository });

    expect(
      await screen.findByText('Impossible de charger les adhérents. Vérifiez la connexion.')
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('heading', { name: 'Jean Exemple' })).toBeOnTheScreen();
  });

  it('says when the server cannot be reached, and offers no addition meanwhile', async () => {
    const connection = { connect: () => Promise.reject(new ServerConfigMissingError()) };
    await renderMemberScreens(routes, { connection });

    expect(await screen.findByText(/Connexion au serveur impossible/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ajouter un adhérent' })).toBeDisabled();
  });

  it('opens the addition form', async () => {
    const user = userEvent.setup();
    await renderMemberScreens(routes, { members: MEMBERS });

    await user.press(await screen.findByRole('button', { name: 'Ajouter un adhérent' }));

    expect(await screen.findByText("Formulaire d'ajout")).toBeOnTheScreen();
  });

  it('opens a member to change it', async () => {
    const user = userEvent.setup();
    await renderMemberScreens(routes, { members: MEMBERS });

    await user.press(await screen.findByRole('button', { name: /Jean Exemple/ }));

    expect(await screen.findByText('Formulaire de modification')).toBeOnTheScreen();
    expect(screen).toHavePathname('/members/m1');
  });
});
