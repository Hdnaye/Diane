/// <reference path="../pb_data/types.d.ts" />

// `pocketbase organizer-upsert`: creates or updates the single organizer
// account from DIANE_ORGANIZER_EMAIL and DIANE_ORGANIZER_KEY (the secret key
// the app authenticates with). Run by `npm run setup` with backend/.env.
// Never prints the email or the key.
$app.rootCmd?.addCommand(
  new Command({
    use: "organizer-upsert",
    short:
      "Create or update the organizer account from DIANE_ORGANIZER_EMAIL and DIANE_ORGANIZER_KEY",
    silenceUsage: true,
    // Handlers run in their own context: everything they use is inside.
    runE: () => {
      const MIN_KEY_LENGTH = 32;
      const email = $os.getenv("DIANE_ORGANIZER_EMAIL").trim();
      const key = $os.getenv("DIANE_ORGANIZER_KEY");
      if (!email || !key) {
        throw new Error(
          "DIANE_ORGANIZER_EMAIL and DIANE_ORGANIZER_KEY must both be set.",
        );
      }
      if (key.length < MIN_KEY_LENGTH) {
        throw new Error(
          `DIANE_ORGANIZER_KEY must be at least ${MIN_KEY_LENGTH} characters long.`,
        );
      }

      // Single account: update the existing one (oldest first), whatever
      // its email, or create it.
      const existing = $app.findRecordsByFilter(
        "organizers",
        "",
        "created",
        1,
        0,
      )[0];
      const record =
        existing ?? new Record($app.findCollectionByNameOrId("organizers"));
      // Setting the password (even the same key) and changing the email
      // regenerate the token key, which ends the app's session: only do it
      // when the email or the key really changes, so that running
      // `npm run setup` again keeps the app logged in.
      const emailChanged = !existing || record.email() !== email;
      const keyChanged = !existing || !record.validatePassword(key);
      if (existing && !emailChanged && !keyChanged && record.verified()) {
        console.log(`Organizer account unchanged (id ${record.id}).`);
        return;
      }
      if (emailChanged) record.setEmail(email);
      if (keyChanged) record.setPassword(key);
      else if (emailChanged) record.refreshTokenKey();
      record.setVerified(true);
      try {
        $app.save(record);
      } catch (error) {
        // Validation errors name the field, never its value.
        console.error("Invalid DIANE_ORGANIZER_EMAIL or DIANE_ORGANIZER_KEY.");
        throw error;
      }
      console.log(
        `Organizer account ${existing ? "updated" : "created"} (id ${record.id}).`,
      );
    },
  }),
);
