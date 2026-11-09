// French messages about a member's fields, shared by the form (checks before sending) and the
// repositories (refusals of the back-end), so the organizer reads the same words for both.
export const memberMessages = {
  nameRequired: "Indiquez le nom de l'adhérent.",
  nameTooLong: 'Le nom ne doit pas dépasser 200 caractères.',
  phoneInvalid: 'Numéro de téléphone invalide. Exemple : 06 39 98 00 01.',
  phoneTaken: "Ce numéro de téléphone est déjà celui d'un autre adhérent.",
  emailInvalid: 'Adresse e-mail invalide. Exemple : prenom.nom@example.com.',
  emailTaken: "Cette adresse e-mail est déjà celle d'un autre adhérent.",
  contactMissing: 'Indiquez au moins un téléphone ou un e-mail.',
};

/** Same limit as the back-end (`members.name`, max 200). */
export const MEMBER_NAME_MAX_LENGTH = 200;
