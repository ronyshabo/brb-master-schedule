// Run with:  npm test   (or node src/schedule/schedule.test.mjs)
//
// Plain script, exits non-zero on failure. Covers which days get a shared
// shift, the month grid, who the picker offers, open shifts, and the email.

import {
  coverageGaps, formatRange, formatTime, resolveHours, timesFor, conflicts, freeFor, groupAssignments, isWholeDayOff, makeAvailability, monthGrid, openShifts, pickerLists, shiftsForDate,
} from './shifts.js'
import { buildBroadcast, buildCoverRequest, gmailComposeUrl } from './broadcast.js'
import { matchBaristaForSignup, normalizeName, validateSignupForm } from '../barista/signup.js'

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`)
  ok ? pass++ : fail++
}
const has = (label, text, part) => eq(`${label} (contains "${part}")`, text.includes(part), true)

console.log('shifts per day')
eq('Mon: open + close', shiftsForDate('2026-11-02'), ['opening', 'closing'])
eq('Thu: open + close', shiftsForDate('2026-11-05'), ['opening', 'closing'])
eq('Fri: + shared', shiftsForDate('2026-11-06'), ['opening', 'closing', 'shared'])
eq('Sat: + shared', shiftsForDate('2026-11-07'), ['opening', 'closing', 'shared'])
eq('Sun: + shared', shiftsForDate('2026-11-08'), ['opening', 'closing', 'shared'])

console.log('month grid (Monday first)')
const nov = monthGrid(2026, 10) // Nov 2026 starts on a Sunday
eq('Nov 1 is the last column of week 1', nov[0], [null, null, null, null, null, null, '2026-11-01'])
eq('Nov has 6 rows', nov.length, 6)
eq('Nov 30 is a Monday', nov[5][0], '2026-11-30')
eq('Feb 2027 starts Monday, 4 rows', [monthGrid(2027, 1)[0][0], monthGrid(2027, 1).length], ['2027-02-01', 4])

const baristas = [
  { id: 'ana', name: 'Ana Morales', email: 'ana@x.com' },
  { id: 'ben', name: 'Ben Carter', email: 'ben@x.com' },
  { id: 'eli', name: 'Eli Brooks' },
  { id: 'old', name: 'Old Timer', active: false },
]
const assignments = [
  { id: '1', date: '2026-11-06', shift: 'opening', baristaId: 'ana', baristaName: 'Ana Morales' },
  { id: '2', date: '2026-11-06', shift: 'closing', baristaId: 'ben', baristaName: 'Ben Carter' },
  { id: '3', date: '2026-11-07', shift: 'opening', baristaId: 'eli', baristaName: 'Eli Brooks' },
]
const assignmentsByDate = groupAssignments(assignments)
// Eli is off Fri 6 and Sat 7 (an old-style entry with no allDay counts as a whole day).
const availabilityOf = makeAvailability([{ baristaId: 'eli', date: '2026-11-06', allDay: true }, { baristaId: 'eli', date: '2026-11-07' }])

console.log('picker lists')
const lists = pickerLists({ baristas, date: '2026-11-06', shift: 'shared', assignmentsByDate, availabilityOf })
eq('assigned', lists.assigned.map((entry) => entry.baristaId), [])
eq('available skips day-off and inactive', lists.available.map((barista) => barista.id), ['ana', 'ben'])
eq('unavailable listed separately', lists.unavailable.map((barista) => barista.id), ['eli'])
eq('notes other shifts that day', lists.otherShifts, { ana: ['opening'], ben: ['closing'] })
const onOpening = pickerLists({ baristas, date: '2026-11-06', shift: 'opening', assignmentsByDate, availabilityOf })
eq('already on the shift is not offered again', onOpening.available.map((barista) => barista.id), ['ben'])
eq('empty shifts to move to', onOpening.emptyShifts, ['shared'])
eq('weekday has no shared to move to', pickerLists({ baristas, date: '2026-11-05', shift: 'opening', assignmentsByDate, availabilityOf }).emptyShifts, ['closing'])

eq('unavailable carries a reason', lists.unavailable.map((barista) => barista.reason), ['dayOff'])

console.log('availability layers')
// Mon 2 Nov 2026 / Tue 3 / Sat 7
const layered = makeAvailability(
  [
    { baristaId: 'ana', date: '2026-11-03', allDay: false, cant: ['closing'] },  // Tue: no closing that day
    { baristaId: 'ana', date: '2026-11-09', allDay: false, cant: [] },           // Mon 9: free despite usual week
  ],
  [{ baristaId: 'ana', cant: { mon: ['opening'], sat: ['shared'] } }]
)
eq('usual week blocks Monday opening', layered('ana', '2026-11-02', 'opening'), { ok: false, reason: 'weekly' })
eq('usual week leaves Monday closing', layered('ana', '2026-11-02', 'closing'), { ok: true })
eq('usual week blocks Saturday shared', layered('ana', '2026-11-07', 'shared'), { ok: false, reason: 'weekly' })
eq('date entry blocks one shift', layered('ana', '2026-11-03', 'closing'), { ok: false, reason: 'date' })
eq('date entry leaves the rest', layered('ana', '2026-11-03', 'opening'), { ok: true })
eq('date entry overrides usual week', layered('ana', '2026-11-09', 'opening'), { ok: true })
eq('other baristas unaffected', layered('ben', '2026-11-02', 'opening'), { ok: true })
eq('whole day off', isWholeDayOff([{ baristaId: 'eli', date: '2026-11-06', allDay: true }], 'eli', '2026-11-06'), true)
eq('partial day is not a day off', isWholeDayOff([{ baristaId: 'ana', date: '2026-11-03', allDay: false, cant: ['closing'] }], 'ana', '2026-11-03'), false)
const monLists = pickerLists({ baristas, date: '2026-11-02', shift: 'opening', assignmentsByDate, availabilityOf: layered })
eq('picker leaves out usual-week block', monLists.available.map((barista) => barista.id), ['ben', 'eli'])
eq('...and says why', monLists.unavailable.map((barista) => [barista.id, barista.reason]), [['ana', 'weekly']])
eq('free for a shift', freeFor({ baristas, date: '2026-11-03', shift: 'closing', availabilityOf: layered }).map((barista) => barista.id), ['ben', 'eli'])
eq('clash with a usual-week block', conflicts({ assignments: [{ id: 'x', date: '2026-11-02', shift: 'opening', baristaId: 'ana' }], availabilityOf: layered })
  .map((entry) => entry.reason), ['weekly'])

console.log('open shifts and conflicts')
eq('Fri 6 + Sat 7', openShifts({ startKey: '2026-11-06', endKey: '2026-11-07', assignmentsByDate }).map((entry) => `${entry.date.slice(8)} ${entry.shift}`),
  ['06 shared', '07 closing', '07 shared'])
eq('scheduled on a day off', conflicts({ assignments, availabilityOf }).map((entry) => entry.id), ['3'])

console.log('broadcast email')
const email = buildBroadcast({ assignments, baristas, startKey: '2026-11-06', endKey: '2026-11-07' })
eq('recipients with email', email.to, ['ana@x.com', 'ben@x.com'])
eq('missing email', email.missingEmail, ['Eli Brooks'])
eq('counts', [email.shiftCount, email.openCount], [3, 3])
eq('subject', email.subject, 'BRB schedule: Nov 6 – Nov 7')
has('per person', email.body, 'Ana Morales (1)\n  • Fri, Nov 6 — Opening (8am – 2pm)')
has('full schedule', email.body, 'Fri, Nov 6 — Opening: Ana Morales · Shared: OPEN · Closing: Ben Carter')
has('weekday without shared', buildBroadcast({ assignments, baristas, startKey: '2026-11-05', endKey: '2026-11-05' }).body, 'Thu, Nov 5 — Opening: OPEN · Closing: OPEN')
has('open list', email.body, 'STILL OPEN')
const url = gmailComposeUrl({ to: email.to, subject: email.subject, body: 'hi', account: 'shop@gmail.com' })
has('gmail uses bcc', url, 'bcc=ana%40x.com%2Cben%40x.com')
has('gmail account', url, 'authuser=shop%40gmail.com')

console.log('hours')
eq('weekday opening', timesFor('2026-11-02', 'opening'), { start: '08:00', end: '14:00', custom: false })
eq('weekday closing', timesFor('2026-11-02', 'closing'), { start: '14:00', end: '21:00', custom: false })
eq('Friday shared uses weekday hours', timesFor('2026-11-06', 'shared'), { start: '12:00', end: '18:00', custom: false })
eq('Saturday opens at 9, hands over at 2', timesFor('2026-11-07', 'opening'), { start: '09:00', end: '14:00', custom: false })
eq('Sunday closing starts at 2', timesFor('2026-11-08', 'closing').start, '14:00')
eq('Sunday closes at 9pm', timesFor('2026-11-08', 'closing').end, '21:00')
const overrides = { '2026-11-02_opening': { start: '08:00', end: '13:00' } }
eq('one-day override wins', timesFor('2026-11-02', 'opening', undefined, overrides), { start: '08:00', end: '13:00', custom: true })
eq('override is that day only', timesFor('2026-11-03', 'opening', undefined, overrides).custom, false)
eq('bad override ignored', timesFor('2026-11-02', 'opening', undefined, { '2026-11-02_opening': { start: '15:00', end: '13:00' } }).end, '14:00')
const saved = resolveHours({ weekend: { opening: { start: '10:00', end: '16:00' }, closing: { start: '9pm', end: '?' } } })
eq('saved default used', saved.weekend.opening, { start: '10:00', end: '16:00' })
eq('broken saved value falls back', saved.weekend.closing, { start: '14:00', end: '21:00' })
eq('format', [formatTime('08:00'), formatTime('14:30'), formatTime('12:00'), formatRange({ start: '09:00', end: '21:00' })], ['8am', '2:30pm', '12pm', '9am – 9pm'])
const times = (key, shift) => timesFor(key, shift, undefined, overrides)
eq('gap when opening leaves early', coverageGaps('2026-11-02', times), [{ start: '13:00', end: '14:00' }])
eq('no gap on a normal day', coverageGaps('2026-11-03', times), [])
eq('shared covers a gap', coverageGaps('2026-11-06', (key, shift) => timesFor(key, shift, undefined, { '2026-11-06_opening': { start: '08:00', end: '13:00' } })), [])
has('custom hours in the email', buildBroadcast({ assignments, baristas, startKey: '2026-11-06', endKey: '2026-11-06',
  timesFor: (key, shift) => timesFor(key, shift, undefined, { '2026-11-06_opening': { start: '08:00', end: '12:30' } }) }).body,
  'Ana Morales (1)\n  • Fri, Nov 6 — Opening (8am – 12:30pm)')

console.log('cover request')
const cover = buildCoverRequest({
  date: '2026-11-06', shift: 'shared', droppedBy: { id: 'ben', name: 'Ben Carter' },
  baristas: [...baristas, { id: 'gus', name: 'Gus Patel', email: 'gus@x.com' }, { id: 'dee', name: 'Dee Lane' }],
  availabilityOf, assignmentsByDate,
})
eq('free baristas only', cover.to, ['gus@x.com'])
eq('free but no email', cover.missingEmail, ['Dee Lane'])
eq('left out', cover.skipped, { off: ['Eli Brooks'], working: ['Ana Morales'] })
eq('subject', cover.subject, 'Shift needs cover: Fri, Nov 6 Shared')
has('who dropped', cover.body, 'Ben Carter can no longer make it.')
has('how to claim', cover.body, '"Add me"')

console.log('sign-up')
const roster = [
  { id: 'a', name: 'Ana Morales' },
  { id: 'b', name: 'Ben Carter', uid: 'u1' },
  { id: 'j', name: 'José Peña' },
  { id: 'old', name: 'Old Timer', active: false },
  { id: 'd1', name: 'Sam Lee' }, { id: 'd2', name: 'Sam Lee' },
]
eq('exact name', matchBaristaForSignup(roster, 'Ana Morales').barista?.id, 'a')
eq('case and spaces ignored', matchBaristaForSignup(roster, '  ana   MORALES ').barista?.id, 'a')
eq('accents ignored', matchBaristaForSignup(roster, 'Jose Pena').barista?.id, 'j')
eq('first name alone is not enough', Boolean(matchBaristaForSignup(roster, 'Ana').error), true)
eq('unknown name refused', matchBaristaForSignup(roster, 'Zed Nobody').error.startsWith("We couldn't find"), true)
eq('already has an account', matchBaristaForSignup(roster, 'Ben Carter').error.startsWith('There is already an account'), true)
eq('inactive barista refused', Boolean(matchBaristaForSignup(roster, 'Old Timer').error), true)
eq('two people, same name', matchBaristaForSignup(roster, 'Sam Lee').error.startsWith('More than one'), true)
eq('full name matches a first-name-only entry', matchBaristaForSignup([{ id: 'r', name: 'Rony' }], 'Rony Shabo').barista?.id, 'r')
eq('first-name-only entry, accents/case', matchBaristaForSignup([{ id: 'r', name: 'jose' }], 'José Peña').barista?.id, 'r')
eq('two first-name-only entries refused', matchBaristaForSignup([{ id: 'r1', name: 'Rony' }, { id: 'r2', name: 'rony' }], 'Rony Shabo').error.startsWith('More than one'), true)
eq('exact full name wins over a first-name entry', matchBaristaForSignup([{ id: 'r', name: 'Rony' }, { id: 'rs', name: 'Rony Shabo' }], 'Rony Shabo').barista?.id, 'rs')
eq('first-name entry already linked', matchBaristaForSignup([{ id: 'r', name: 'Rony', uid: 'x' }], 'Rony Shabo').error.startsWith('There is already'), true)
eq('normalize', normalizeName("  D'Angelo  Ruíz "), "d'angelo ruiz")
eq('form ok', validateSignupForm({ email: 'a@b.co', password: 'secret1', confirm: 'secret1' }), null)
eq('bad email', validateSignupForm({ email: 'nope', password: 'secret1', confirm: 'secret1' }), 'Enter a valid email address.')
eq('short password', validateSignupForm({ email: 'a@b.co', password: '123', confirm: '123' }), 'Password must be at least 6 characters.')
eq('mismatch', validateSignupForm({ email: 'a@b.co', password: 'secret1', confirm: 'secret2' }), "The passwords don't match.")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
