// Security-rules tests for the merged ruleset (firestore-live-plus-schedule.rules),
// run against the Firestore emulator:
//   cd rules-test && npm install && npm test      (needs Java on PATH)
//
// Every write below has the exact shape store.js / baristaAuth.js send.

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-brb',
  firestore: { rules: readFileSync(new URL('../firestore-live-plus-schedule.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
})
const anon = env.unauthenticatedContext().firestore()
const ana = env.authenticatedContext('uid-ana', { email: 'ana@example.com' }).firestore()
const newbie = env.authenticatedContext('uid-new', { email: 'new@example.com' }).firestore()
const stranger = env.authenticatedContext('uid-x', { email: 'x@example.com' }).firestore()
const admin = env.authenticatedContext('uid-admin', { email: 'brbcafeatx@gmail.com' }).firestore()

let failures = 0
const test = async (name, fn) => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'baristas/ana'), { name: 'Ana Morales', active: true, uid: 'uid-ana', email: 'ana@example.com' })
    await setDoc(doc(db, 'baristas/ben'), { name: 'Ben Carter', active: true, uid: 'uid-ben', email: 'ben@example.com' })
    await setDoc(doc(db, 'baristas/new'), { name: 'New Person', active: true, basePay: 0 })
    await setDoc(doc(db, 'scheduleUsers/uid-ana'), { uid: 'uid-ana', baristaId: 'ana' })
    await setDoc(doc(db, 'scheduleUsers/uid-ben'), { uid: 'uid-ben', baristaId: 'ben' })
    await setDoc(doc(db, 'scheduleShifts/2026-11-02_opening'), { date: '2026-11-02', shift: 'opening', baristaId: 'ben', baristaName: 'Ben Carter', assignedBy: 'admin', createdAt: new Date() })
    await setDoc(doc(db, 'scheduleShifts/2026-11-02_closing'), { date: '2026-11-02', shift: 'closing', baristaId: 'ana', baristaName: 'Ana Morales', assignedBy: 'admin', createdAt: new Date() })
    await setDoc(doc(db, 'scheduleUnavailability/ben_2026-11-05'), { baristaId: 'ben', baristaName: 'Ben Carter', date: '2026-11-05', allDay: true, cant: [], createdAt: new Date() })
    await setDoc(doc(db, 'scheduleAlerts/a1'), { type: 'dropped', date: '2026-11-03', shift: 'opening', baristaId: 'ben', baristaName: 'Ben Carter', createdAt: new Date(), status: 'new' })
    await setDoc(doc(db, 'inventoryItems/i1'), { name: 'Oat milk' })
  })
  try { await fn(); console.log(`ok   ${name}`) } catch (e) { failures++; console.error(`FAIL ${name}\n     ${e.message}`) }
}

const shift = (who, name, date, s) => ({ date, shift: s, baristaId: who, baristaName: name, assignedBy: name, createdAt: serverTimestamp() })
const dayOff = (who, name, date, extra = {}) => ({ baristaId: who, baristaName: name, date, allDay: true, cant: [], createdAt: serverTimestamp(), ...extra })

// ---- sign-up (baristaAuth.js) ----
await test('logged out cannot read the barista list (base pay, emails)', () => assertFails(getDocs(collection(anon, 'baristas'))))
await test('a new account can read it to match its name', () => assertSucceeds(getDocs(collection(newbie, 'baristas'))))
await test('new account links an unlinked barista', () =>
  assertSucceeds(updateDoc(doc(newbie, 'baristas/new'), { uid: 'uid-new', email: 'new@example.com', linkedAt: serverTimestamp() })))
await test('...and creates its scheduleUsers gate', () =>
  assertSucceeds(setDoc(doc(newbie, 'scheduleUsers/uid-new'), { uid: 'uid-new', baristaId: 'new', baristaName: 'New Person', email: 'new@example.com', createdAt: serverTimestamp() })))
await test('cannot take over an already-linked barista', () =>
  assertFails(updateDoc(doc(stranger, 'baristas/ana'), { uid: 'uid-x', email: 'x@example.com', linkedAt: serverTimestamp() })))
await test('linking cannot change other fields', () =>
  assertFails(updateDoc(doc(newbie, 'baristas/new'), { uid: 'uid-new', email: 'new@example.com', linkedAt: serverTimestamp(), basePay: 99 })))

// ---- reading the schedule ----
for (const c of ['scheduleShifts', 'scheduleUnavailability', 'scheduleWeekly', 'scheduleSettings', 'scheduleShiftTimes']) {
  await test(`linked barista reads ${c}`, () => assertSucceeds(getDocs(collection(ana, c))))
  await test(`logged-out visitor cannot read ${c}`, () => assertFails(getDocs(collection(anon, c))))
  await test(`account without a gate cannot read ${c}`, () => assertFails(getDocs(collection(stranger, c))))
}

// ---- shifts ----
await test('barista takes an empty shift', () => assertSucceeds(setDoc(doc(ana, 'scheduleShifts/2026-11-04_opening'), shift('ana', 'Ana Morales', '2026-11-04', 'opening'))))
await test('barista cannot put someone else on a shift', () => assertFails(setDoc(doc(ana, 'scheduleShifts/2026-11-04_opening'), shift('ben', 'Ben Carter', '2026-11-04', 'opening'))))
await test('barista cannot take a shift that is already taken', () => assertFails(setDoc(doc(ana, 'scheduleShifts/2026-11-02_opening'), shift('ana', 'Ana Morales', '2026-11-02', 'opening'))))
await test('doc id must be date_shift', () => assertFails(setDoc(doc(ana, 'scheduleShifts/whatever'), shift('ana', 'Ana Morales', '2026-11-04', 'opening'))))
await test('shift name must be real', () => assertFails(setDoc(doc(ana, 'scheduleShifts/2026-11-04_lunch'), shift('ana', 'Ana Morales', '2026-11-04', 'lunch'))))
await test('client cannot fake createdAt', () => assertFails(setDoc(doc(ana, 'scheduleShifts/2026-11-04_opening'), { ...shift('ana', 'Ana Morales', '2026-11-04', 'opening'), createdAt: new Date(2020, 0, 1) })))
await test('barista drops their own shift', () => assertSucceeds(deleteDoc(doc(ana, 'scheduleShifts/2026-11-02_closing'))))
await test("barista cannot drop someone else's shift", () => assertFails(deleteDoc(doc(ana, 'scheduleShifts/2026-11-02_opening'))))
await test('admin replaces whoever is on a shift', () => assertSucceeds(setDoc(doc(admin, 'scheduleShifts/2026-11-02_opening'), shift('ana', 'Ana Morales', '2026-11-02', 'opening'))))
await test('admin assigns and removes anyone', async () => {
  await assertSucceeds(setDoc(doc(admin, 'scheduleShifts/2026-11-06_shared'), shift('ben', 'Ben Carter', '2026-11-06', 'shared')))
  await assertSucceeds(deleteDoc(doc(admin, 'scheduleShifts/2026-11-02_opening')))
})

// ---- availability ----
await test('barista marks a day off', () => assertSucceeds(setDoc(doc(ana, 'scheduleUnavailability/ana_2026-11-09'), dayOff('ana', 'Ana Morales', '2026-11-09'))))
await test('barista sets some shifts out for a day', () =>
  assertSucceeds(setDoc(doc(ana, 'scheduleUnavailability/ana_2026-11-09'), dayOff('ana', 'Ana Morales', '2026-11-09', { allDay: false, cant: ['closing'] }))))
await test("barista cannot set someone else's day", () => assertFails(setDoc(doc(ana, 'scheduleUnavailability/ben_2026-11-09'), dayOff('ben', 'Ben Carter', '2026-11-09'))))
await test('bad shift list refused', () =>
  assertFails(setDoc(doc(ana, 'scheduleUnavailability/ana_2026-11-09'), dayOff('ana', 'Ana Morales', '2026-11-09', { allDay: false, cant: ['nap'] }))))
await test('barista clears their own day', async () => {
  await assertSucceeds(setDoc(doc(ana, 'scheduleUnavailability/ana_2026-11-09'), dayOff('ana', 'Ana Morales', '2026-11-09')))
  await assertSucceeds(deleteDoc(doc(ana, 'scheduleUnavailability/ana_2026-11-09')))
})
await test("barista cannot clear someone else's day", () => assertFails(deleteDoc(doc(ana, 'scheduleUnavailability/ben_2026-11-05'))))
await test('barista saves their usual week', () =>
  assertSucceeds(setDoc(doc(ana, 'scheduleWeekly/ana'), { baristaId: 'ana', baristaName: 'Ana Morales', cant: { mon: ['opening'] }, updatedAt: serverTimestamp() })))
await test("barista cannot save someone else's usual week", () =>
  assertFails(setDoc(doc(ana, 'scheduleWeekly/ben'), { baristaId: 'ben', baristaName: 'Ben Carter', cant: {}, updatedAt: serverTimestamp() })))

// ---- dropped-shift alerts ----
await test('barista raises an alert for their own drop', () =>
  assertSucceeds(setDoc(doc(ana, 'scheduleAlerts/a2'), { type: 'dropped', date: '2026-11-04', shift: 'opening', baristaId: 'ana', baristaName: 'Ana Morales', createdAt: serverTimestamp(), status: 'new' })))
await test('barista cannot raise one in someone else\'s name', () =>
  assertFails(setDoc(doc(ana, 'scheduleAlerts/a3'), { type: 'dropped', date: '2026-11-04', shift: 'opening', baristaId: 'ben', baristaName: 'Ben Carter', createdAt: serverTimestamp(), status: 'new' })))
await test('baristas cannot read alerts', () => assertFails(getDoc(doc(ana, 'scheduleAlerts/a1'))))
await test('admin reads and updates alerts', async () => {
  await assertSucceeds(getDocs(collection(admin, 'scheduleAlerts')))
  await assertSucceeds(updateDoc(doc(admin, 'scheduleAlerts/a1'), { status: 'emailed', emailedAt: serverTimestamp() }))
})

// ---- hours ----
await test('barista cannot change hours', async () => {
  await assertFails(setDoc(doc(ana, 'scheduleSettings/hours'), { weekday: {} }))
  await assertFails(setDoc(doc(ana, 'scheduleShiftTimes/2026-11-04_opening'), { date: '2026-11-04', shift: 'opening', start: '08:00', end: '13:00' }))
})
await test('admin changes hours', async () => {
  await assertSucceeds(setDoc(doc(admin, 'scheduleSettings/hours'), { weekday: {}, updatedAt: serverTimestamp() }))
  await assertSucceeds(setDoc(doc(admin, 'scheduleShiftTimes/2026-11-04_opening'), { date: '2026-11-04', shift: 'opening', start: '08:00', end: '13:00', updatedAt: serverTimestamp() }))
})
await test('admin sets a barista email (broadcast)', () => assertSucceeds(updateDoc(doc(admin, 'baristas/new'), { email: 'p@example.com' })))

// ---- the rest of the live rules still behave ----
await test('inventory still public to read', () => assertSucceeds(getDoc(doc(anon, 'inventoryItems/i1'))))
await test('unknown collections still closed', () => assertFails(setDoc(doc(admin, 'nothingHere/x'), { a: 1 })))

await env.cleanup()
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
