// Run with:  npm test   (or node src/schedule/schedule.test.mjs)
//
// Plain script, exits non-zero on failure. Covers which days get a shared
// shift, the month grid, who the picker offers, open shifts, and the email.

import {
  autoFill, baristaColors, BARISTA_COLORS, DAY_ORDER, shiftsOnDay, coverageGaps, formatRange, formatTime, resolveHours, timesFor, conflicts, freeFor, groupAssignments, isWholeDayOff, makeAvailability, monthGrid, openShifts, pickerLists, shiftsForDate,
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
  { id: 's1', name: 'Sam Lee' }, { id: 's2', name: 'Sam Ortiz' },
]
eq('exact name', matchBaristaForSignup(roster, 'Ana Morales').barista?.id, 'a')
eq('first name alone', matchBaristaForSignup(roster, 'Ana').barista?.id, 'a')
eq('case and spaces ignored', matchBaristaForSignup(roster, '  ana   ').barista?.id, 'a')
eq('accents ignored', matchBaristaForSignup(roster, 'Jose').barista?.id, 'j')
eq('only the first name is compared', matchBaristaForSignup(roster, 'Ana Smith').barista?.id, 'a')
eq('unknown name refused', matchBaristaForSignup(roster, 'Zed').error.startsWith("We couldn't find"), true)
eq('already has an account', matchBaristaForSignup(roster, 'Ben').error.startsWith('There is already an account'), true)
eq('inactive barista refused', Boolean(matchBaristaForSignup(roster, 'Old').error), true)
eq('shared first name asks for the full name', matchBaristaForSignup(roster, 'Sam').error.startsWith('More than one barista has that first name'), true)
eq('full name picks between shared first names', matchBaristaForSignup(roster, 'Sam Ortiz').barista?.id, 's2')
eq('two people, same full name', matchBaristaForSignup([...roster, { id: 's3', name: 'Sam Lee' }], 'Sam Lee').error.startsWith('More than one barista has that name'), true)
eq('linked namesake is skipped', matchBaristaForSignup([{ id: 'r1', name: 'Rony', uid: 'x' }, { id: 'r2', name: 'Rony Shabo' }], 'Rony').barista?.id, 'r2')
eq('first-name-only entry, accents/case', matchBaristaForSignup([{ id: 'r', name: 'jose' }], 'José Peña').barista?.id, 'r')
eq('normalize', normalizeName("  D'Angelo  Ruíz "), "d'angelo ruiz")
eq('form ok', validateSignupForm({ email: 'a@b.co', password: 'secret1', confirm: 'secret1' }), null)
eq('bad email', validateSignupForm({ email: 'nope', password: 'secret1', confirm: 'secret1' }), 'Enter a valid email address.')
eq('short password', validateSignupForm({ email: 'a@b.co', password: '123', confirm: '123' }), 'Password must be at least 6 characters.')
eq('mismatch', validateSignupForm({ email: 'a@b.co', password: 'secret1', confirm: 'secret2' }), "The passwords don't match.")

console.log('middle shift')
{
  const day = groupAssignments([
    { date: '2026-11-03', shift: 'opening', baristaId: 'ana', baristaName: 'Ana' },
    { date: '2026-11-03', shift: 'middle', baristaId: 'ben', baristaName: 'Ben' },
  ])['2026-11-03']
  eq('not a regular shift', shiftsForDate('2026-11-03').includes('middle'), false)
  eq('shown only when someone is on it', shiftsOnDay('2026-11-03', {}), ['opening', 'closing'])
  eq('sits between opening and closing', shiftsOnDay('2026-11-03', day), ['opening', 'middle', 'closing'])
  eq('Fri order', shiftsOnDay('2026-11-06', { middle: [{}] }), ['opening', 'middle', 'shared', 'closing'])
  eq('day order', DAY_ORDER, ['opening', 'middle', 'shared', 'closing'])
  eq('defaults to 12pm - 2pm', timesFor('2026-11-03', 'middle'), { start: '12:00', end: '14:00', custom: false })
  eq('old saved hours without middle still get it', resolveHours({ weekday: { opening: { start: '07:00', end: '12:00' } } }).weekday.middle, { start: '12:00', end: '14:00' })
  // Opener leaves at noon; Ben covers 12-2.
  const cut = { '2026-11-03_opening': { start: '08:00', end: '12:00' } }
  const times = (date, shift) => timesFor(date, shift, undefined, cut)
  eq('opener leaving at noon leaves a gap', coverageGaps('2026-11-03', times), [{ start: '12:00', end: '14:00' }])
  eq('...that the middle shift covers', coverageGaps('2026-11-03', times, shiftsOnDay('2026-11-03', day)), [])
  eq('never counted as open', openShifts({ startKey: '2026-11-03', endKey: '2026-11-03', assignmentsByDate: {} }).map((entry) => entry.shift), ['opening', 'closing'])
}

console.log('barista colours')
{
  const team = [{ id: 'ana', name: 'Ana', uid: 'u-ana' }, { id: 'ben', name: 'Ben', uid: 'u-ben2' }, { id: 'cy', name: 'Cy' }]
  const users = [
    { id: 'u-ana', uid: 'u-ana', baristaId: 'ana', color: 'teal' },
    { id: 'u-ben1', uid: 'u-ben1', baristaId: 'ben', color: 'red' }, // Ben's old login
    { id: 'u-ben2', uid: 'u-ben2', baristaId: 'ben', color: 'not-a-colour' },
  ]
  eq('picked colour by barista id; old logins and unknown ids ignored', baristaColors(users, team), { ana: '#00796b' })
  eq('twelve colours, unique ids', new Set(BARISTA_COLORS.map((color) => color.id)).size, 12)
}

console.log('auto-fill')
{
  // Mon 2 - Sun 8 Nov 2026: 2+2+2+2 + 3+3+3 = 17 shifts.
  const team = [
    { id: 'ana', name: 'Ana' },
    { id: 'ben', name: 'Ben' },
    { id: 'cy', name: 'Cy', active: false },
    { id: 'dee', name: 'Dee' },
  ]
  const existing = groupAssignments([
    { id: '2026-11-02_opening', date: '2026-11-02', shift: 'opening', baristaId: 'ben', baristaName: 'Ben' },
    // outside the range: must not count
    { id: '2026-10-30_opening', date: '2026-10-30', shift: 'opening', baristaId: 'ana', baristaName: 'Ana' },
  ])
  const availability = makeAvailability(
    [{ baristaId: 'dee', date: '2026-11-04', allDay: true }],
    [{ baristaId: 'ana', cant: { sat: ['opening', 'closing', 'shared'], sun: ['opening', 'closing', 'shared'] } }]
  )
  const plan = autoFill({ baristas: team, startKey: '2026-11-02', endKey: '2026-11-08', assignmentsByDate: existing, availabilityOf: availability })
  const at = (date, shift) => plan.proposals.find((entry) => entry.date === date && entry.shift === shift)?.baristaName ?? null

  eq('leaves a taken shift alone', at('2026-11-02', 'opening'), null)
  eq('16 empty shifts, all accounted for', plan.proposals.length + plan.unfilled.length, 16)
  eq('never picks an inactive barista', plan.proposals.some((entry) => entry.baristaId === 'cy'), false)
  eq('respects a day off', at('2026-11-04', 'opening') !== 'Dee' && at('2026-11-04', 'closing') !== 'Dee', true)
  eq('respects the usual week', plan.proposals.some((entry) => entry.baristaId === 'ana' && entry.date >= '2026-11-07'), false)
  const doubles = plan.proposals.filter((entry, index, all) =>
    all.some((other, otherIndex) => otherIndex < index && other.date === entry.date && other.baristaId === entry.baristaId))
  eq('nobody twice on one day', doubles.length, 0)
  eq('Wed: Dee off, so Ana and Ben', [at('2026-11-04', 'opening'), at('2026-11-04', 'closing')].sort(), ['Ana', 'Ben'])
  eq('Sat and Sun shared: only Ben and Dee free, both already on', plan.unfilled, [
    { date: '2026-11-07', shift: 'shared' },
    { date: '2026-11-08', shift: 'shared' },
  ])
  eq('existing shifts in range count toward balance', at('2026-11-02', 'closing'), 'Ana')
  eq('counts per barista (Ana is off weekends)', plan.counts, { ben: 6, ana: 4, dee: 5 })
  eq('nothing to do when all is filled', autoFill({ baristas: team, startKey: '2026-11-02', endKey: '2026-11-02',
    assignmentsByDate: groupAssignments([
      { date: '2026-11-02', shift: 'opening', baristaId: 'ben', baristaName: 'Ben' },
      { date: '2026-11-02', shift: 'closing', baristaId: 'ana', baristaName: 'Ana' },
    ]), availabilityOf: availability }).proposals, [])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
