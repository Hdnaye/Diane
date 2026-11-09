import {
  createInMemoryMemberRepository,
  MemberValidationError,
  type Member,
} from '@/data/member-repository';

// Fictitious members only (CLAUDE.md, "Dépôt public").
const JEAN: Member = {
  id: 'member-jean',
  name: 'Jean Exemple',
  phone: '+33639980001',
  email: '',
  active: true,
};
const EMILE: Member = {
  id: 'member-emile',
  name: 'Émile Fictif',
  phone: '',
  email: 'emile@example.com',
  active: false,
};

async function rejection(promise: Promise<unknown>): Promise<MemberValidationError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(MemberValidationError);
  return error as MemberValidationError;
}

describe('in-memory member repository', () => {
  it('lists the members sorted by name, accents and case ignored', async () => {
    const repository = createInMemoryMemberRepository([
      JEAN,
      EMILE,
      { ...JEAN, id: 'm3', name: 'alain Test', phone: '+33639980003' },
    ]);

    const names = (await repository.list()).map((member) => member.name);

    expect(names).toEqual(['alain Test', 'Émile Fictif', 'Jean Exemple']);
  });

  it('creates a member with a normalized contact', async () => {
    const repository = createInMemoryMemberRepository();

    const created = await repository.create({
      name: '  Paul Essai ',
      phone: '06 39 98 00 05',
      email: ' Paul@Example.com ',
      active: true,
    });

    expect(created).toEqual({
      id: expect.any(String),
      name: 'Paul Essai',
      phone: '+33639980005',
      email: 'paul@example.com',
      active: true,
    });
    expect(await repository.list()).toEqual([created]);
  });

  it('refuses a phone number or an e-mail already used by another member', async () => {
    const repository = createInMemoryMemberRepository([JEAN, EMILE]);

    const error = await rejection(
      repository.create({
        name: 'Paul Essai',
        phone: '06 39 98 00 01',
        email: 'EMILE@example.com',
        active: true,
      })
    );

    expect(error.fields).toEqual({
      phone: "Ce numéro de téléphone est déjà celui d'un autre adhérent.",
      email: "Cette adresse e-mail est déjà celle d'un autre adhérent.",
    });
  });

  it('refuses a member without any contact, or with an invalid phone number', async () => {
    const repository = createInMemoryMemberRepository();

    expect(
      (
        await rejection(
          repository.create({ name: 'Paul Essai', phone: '', email: '', active: true })
        )
      ).fields
    ).toEqual({ phone: 'Indiquez au moins un téléphone ou un e-mail.' });
    expect(
      (await rejection(repository.create({ name: '', phone: '12 34', email: '', active: true })))
        .fields
    ).toEqual({
      name: "Indiquez le nom de l'adhérent.",
      phone: 'Numéro de téléphone invalide. Exemple : 06 39 98 00 01.',
    });
  });

  it('updates a member, who may keep its own contact', async () => {
    const repository = createInMemoryMemberRepository([JEAN, EMILE]);

    const updated = await repository.update(JEAN.id, {
      name: 'Jean Exemple fils',
      phone: '06 39 98 00 01',
      email: 'jean@example.com',
      active: true,
    });

    expect(updated).toEqual({ ...JEAN, name: 'Jean Exemple fils', email: 'jean@example.com' });
    expect(await repository.list()).toContainEqual(updated);
  });

  it('stops or resumes inviting a member', async () => {
    const repository = createInMemoryMemberRepository([JEAN]);

    expect(await repository.setActive(JEAN.id, false)).toEqual({ ...JEAN, active: false });
    expect(await repository.list()).toEqual([{ ...JEAN, active: false }]);
  });

  it('deletes a member', async () => {
    const repository = createInMemoryMemberRepository([JEAN, EMILE]);

    await repository.remove(JEAN.id);

    expect(await repository.list()).toEqual([EMILE]);
  });
});
