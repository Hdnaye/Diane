/// <reference path="../pb_data/types.d.ts" />

// Warns at startup when a fake transport (tests only) is on: every message
// would be written to DIANE_FAKE_OUTBOX_DIR and counted as sent, nothing
// would reach the members. Printed on the console and in PocketBase's logs;
// names the variable only, never a message, a path or a secret.
onBootstrap((e) => {
  e.next();
  const { transportConfig } =
    /** @type {typeof import("./lib/transports.cjs")} */ (
      require(`${__hooks}/lib/transports.cjs`)
    );
  const config = transportConfig((name) => $os.getenv(name));
  for (const [kind, variable] of [
    [config.sms.kind, "DIANE_SMS_TRANSPORT"],
    [config.email.kind, "DIANE_EMAIL_TRANSPORT"],
  ]) {
    if (kind !== "fake") continue;
    const message = `WARNING: ${variable}=fake: messages are written to disk and counted as sent, not delivered (tests only).`;
    console.warn(message);
    e.app.logger().warn(message);
  }
});
