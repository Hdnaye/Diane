/// <reference path="../pb_data/types.d.ts" />

// Members: active by default, contact normalized (email in lower case, phone
// in E.164) and at least an email or a phone number.

onRecordCreateRequest((e) => {
  if (!("active" in e.requestInfo().body)) e.record?.set("active", true);
  e.next();
}, "members");

onRecordValidate((e) => {
  const { normalizeFrenchPhone } =
    /** @type {typeof import("./lib/phone.cjs")} */ (
      require(`${__hooks}/lib/phone.cjs`)
    );
  const record = /** @type {core.Record} */ (e.record);

  record.set("name", record.getString("name").trim());
  const email = record.getString("email").trim().toLowerCase();
  record.set("email", email);

  const rawPhone = record.getString("phone").trim();
  const phone = rawPhone ? normalizeFrenchPhone(rawPhone) : "";
  if (phone === null) {
    throw new BadRequestError("Invalid member.", {
      phone: new ValidationError(
        "invalid_phone",
        "Must be a French phone number.",
      ),
    });
  }
  record.set("phone", phone);

  if (!email && !phone) {
    const missing = () =>
      new ValidationError(
        "missing_contact",
        "An email or a phone number is required.",
      );
    throw new BadRequestError("Invalid member.", {
      email: missing(),
      phone: missing(),
    });
  }
  e.next();
}, "members");
