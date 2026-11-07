/// <reference path="../pb_data/types.d.ts" />

// Hunts: draft by default, a real calendar day, and a response deadline
// before the hunt starts (Paris time).

onRecordValidate((e) => {
  const { isValidDay, parisToUtc, parseUtcDateTime } =
    /** @type {typeof import("./lib/paris-time.cjs")} */ (
      require(`${__hooks}/lib/paris-time.cjs`)
    );
  const record = /** @type {core.Record} */ (e.record);

  if (!record.getString("status")) record.set("status", "draft");

  const date = record.getString("date");
  const time = record.getString("meeting_time");
  // Malformed values are reported by the field validators (e.next()).
  const wellFormedDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const wellFormedTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

  if (wellFormedDate && !isValidDay(date)) {
    throw new BadRequestError("Invalid hunt.", {
      date: new ValidationError("invalid_date", "Must be a calendar day."),
    });
  }

  const deadline = parseUtcDateTime(record.getString("response_deadline"));
  if (
    deadline &&
    wellFormedDate &&
    wellFormedTime &&
    deadline.getTime() >= parisToUtc(date, time).getTime()
  ) {
    throw new BadRequestError("Invalid hunt.", {
      response_deadline: new ValidationError(
        "deadline_after_hunt",
        "Must be before the hunt starts.",
      ),
    });
  }
  e.next();
}, "hunts");
