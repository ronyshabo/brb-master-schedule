# brb-master-schedule

The barista schedule for BRB Coffee — the master copy of who works when.

- **schedule.brbcoffee-atx.com** (this app): baristas see the month, fill shifts, and mark the days they can't work.
- **staff.brbcoffee-atx.com** (brb-baristas-admin): the admin tab edits anything and emails the schedule out.
  Its code lives here in `src/schedule/` and is copied over by `scripts/sync-admin-tab.sh`.

## Run it locally

Needs the Firebase keys (same project as the other BRB apps):

```bash
npm install
cp .env.local.example .env.local   # fill in the VITE_FIREBASE_* values
npm run dev                        # → http://localhost:5178/
npm test                           # shift rules, emails, sign-up matching
```

The admin side runs inside brb-baristas-admin (`npm run dev` there).

## Deploy

Pushing to `main` deploys: the GitHub workflow builds the Docker image with the Firebase secrets and runs it on the
EC2 box as container `brb-schedule` on port 3005, which Caddy serves as schedule.brbcoffee-atx.com.

## Firestore rules

Firebase has one rules file for the whole project. `firestore-live-plus-schedule.rules` is the full live file with
this app's block (`firestore-schedule.rules`) added at the end. Publish it in the Firebase console
(Firestore → Rules) **before** the app goes live, or logins work but the schedule shows permission errors.
`cd rules-test && npm install && npm test` checks it in the Firestore emulator (needs Java).

## Accounts

The schedule is behind a login. **Create an account** asks for the barista's name, email and password:
- the name must match a barista the manager added in Staff Management (case, spacing and accents don't
  matter; the first name alone is enough, and the full name picks between two baristas with the same first name), who is active and has no account yet;
- the account is then linked to that barista: `baristas/{id}` gets `uid`, `email`, `linkedAt`, and
  `scheduleUsers/{uid}` is created (the same linking brb-schedule used, which the live rules already allow
  only once per barista).

Each barista can then only change their own shifts and availability. "Forgot password" sends Firebase's
reset email. An account whose barista record is missing sees a "not linked" message instead of the schedule.

`npm test` runs the shift-rule and email tests.

## How it works

Each day on the calendar has an **Opening** bubble on top and **Closing** under it. Friday, Saturday
and Sunday also have a **Shared** bubble to their right. **Each shift has exactly one barista.** Which days
have a shared shift is `SHARED_DAYS` in `src/schedule/shifts.js`.

**Hours.** Every bubble shows its hours. The shop's defaults (`DEFAULT_HOURS`):

| | Opening | Closing | Shared |
|---|---|---|---|
| Mon – Fri | 8am – 2pm | 2pm – 9pm | 12pm – 6pm (Fridays — shared runs Fri, Sat, Sun) |
| Sat – Sun | 9am – 2pm | 2pm – 9pm | 12pm – 6pm |

The admin can change them two ways:
- **Shift hours** panel: the default hours for Mon–Fri and Sat–Sun.
- **One shift on one date** (someone coming in late or leaving early): open the shift and change its hours.
  It shows with a dark time label on the calendar, and "Reset to …" puts it back to the default.

If changed hours leave part of the day with nobody on (opening ends 1pm, closing starts 2pm), the admin
calendar marks that day "nobody 1pm–2pm" and the editor warns before saving. Emails use the actual hours.

Names in the bubbles are shown in full. Tapping a bubble opens that shift; tapping a name opens it with that
person picked.

| | Barista page | Admin tab |
|---|---|---|
| Take an empty shift | "Add me" (first one wins) | assign anyone available |
| Taken shift | view only, unless it's theirs | Replace, Move, Remove |
| Own shift | move to an empty shift that day, or "I can't make it" | — |
| Add someone on their day off | no | yes, after a confirm |
| Days off | only their own | — |
| Past days | read-only | editable |

A shift can never hold two people: its id is the date and shift, and taking it only succeeds if it is still
empty (a Firestore transaction), so two baristas tapping "Add me" at once can't both get it.

**When a barista drops a shift** ("I can't make it", or moving to another shift), it goes back to empty and an
alert appears at the top of the admin tab under **Dropped shifts** (and as a desktop notification if the
admin tab is open and alerts are turned on). From there, **Email N baristas** opens a cover request in Gmail
to everyone free that day (not off, not already working that day, not the one who dropped it); the first
to tap "Add me" gets it, and the alert then shows who covered it.

On phones the month turns into a list of days, and opens at today.

**My availability** (barista page) has two layers:
- **My usual week**: a grid of weekdays × shifts. Tap the shifts you can't usually do (e.g. no openings on
  Mondays); it repeats every week. Blocking a shift you're already booked on warns first.
- **Specific dates**: tap a day to choose which shifts you can do that day, or "Off all day". A date overrides
  the usual week either way, and "Use my usual week" removes the override. Drag across several days to mark them
  all off (on a phone, hold first); starting the drag on a day off sets the range back to the usual week.

Availability is per shift everywhere: the pop-up's list only shows baristas who can do *that* shift; the rest are
under "Can't do this shift" tagged *day off*, *can't that day* or *usual week* (the admin can still assign
them after a confirm). Cover emails go only to people who can do the shift. The admin calendar marks an empty
shift "nobody free" when no barista can do it, and "Scheduled when they can't" lists bookings that clash.

**Admin tab** also lists empty shifts from today to month end, baristas scheduled on a day they marked off,
and **Broadcast the schedule**: one email for a date range with each person's shifts and the full schedule,
opened in Gmail from the shop account (BCC) or copied.

## Data (Firestore, once connected)

| Collection | Fields | Doc id |
|---|---|---|
| `baristas` | `name, email, active` (shared with the staff tab) | existing |
| `scheduleShifts` | `date, shift, baristaId, baristaName, assignedBy, createdAt` | `{date}_{shift}` (one barista per shift) |
| `scheduleUnavailability` | `baristaId, baristaName, date, allDay, cant: [shift], createdAt` (one date; `allDay` = off all day) | `{baristaId}_{date}` |
| `scheduleWeekly` | `baristaId, baristaName, cant: { mon: [shift], … }, updatedAt` (usual week) | `{baristaId}` |
| `scheduleSettings` | doc `hours`: `{ weekday: { opening: { start, end }, closing, shared }, weekend: {...} }` | `hours` |
| `scheduleShiftTimes` | `date, shift, start, end` (one shift's hours on one date) | `{date}_{shift}` |
| `scheduleAlerts` | `type: 'dropped', date, shift, baristaId, baristaName, createdAt, status, emailedAt` | `{date}_{shift}_{timestamp}` |

## Still to do

- Automatic notifications: today the admin hears about a dropped shift on the admin tab and sends the cover
  email with one click. Emailing the admins and the team automatically, with nobody on the page, needs a
  small server job (e.g. on the EC2 box with the Firebase Admin SDK) watching `scheduleAlerts`.
- Staff Management's pay statements still read shifts from Google Calendar; switch them to `scheduleShifts`.
- After changing anything in `src/schedule/`, run `scripts/sync-admin-tab.sh` to update the Schedule tab in
  brb-baristas-admin.
