import { useEffect, useMemo, useState } from 'react'
import AuthPage from './AuthPage'
import { linkAccount, signOut, watchAuth } from './baristaAuth.js'
import MonthNav from '../schedule/MonthNav'
import ScheduleCalendar from '../schedule/ScheduleCalendar'
import ShiftPicker from '../schedule/ShiftPicker'
import AvailabilityCalendar from '../schedule/AvailabilityCalendar'
import WeeklyAvailability from '../schedule/WeeklyAvailability'
import { Legend } from '../schedule/AdminScheduleTab'
import { useScheduleData } from '../schedule/useScheduleData'
import { assignShift, dropShift, moveShift, setMyColor } from '../schedule/store'
import { BARISTA_COLORS, SHIFTS, dateKey, formatDay, formatRange, pickerLists } from '../schedule/shifts.js'
import '../schedule/schedule.css'
import './barista.css'

// The site frame from brbcoffee-atx.com: orange bar, cream masthead, green ticker.
function PageFrame({ barRight, marquee, children }) {
  return (
    <div className="sched-root barista-page">
      <div className="barista-bar">
        <span>schedule.exe</span>
        {barRight}
      </div>
      <header className="barista-masthead">
        <p className="barista-tagline">Brew Boldly. Gather Warmly</p>
        <h1>BRB Schedule</h1>
      </header>
      <div className="barista-marquee">{marquee}</div>
      <main className="barista-body">{children}</main>
    </div>
  )
}

// The colour your name shows in on the calendar, for everyone.
function ColorPanel({ uid, current }) {
  const currentId = BARISTA_COLORS.find((color) => color.hex === current)?.id || null
  return (
    <section className="sched-panel">
      <h3>my-color.cfg</h3>
      <p className="sched-muted">Pick a colour for your name on the schedule, so your shifts are easy to spot. Everyone sees it.</p>
      <div className="sched-color-choices" role="group" aria-label="Name colour">
        {BARISTA_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            className="sched-color-swatch"
            style={{ '--who': color.hex }}
            aria-pressed={currentId === color.id}
            onClick={() => setMyColor(uid, color.id)}
          >
            {color.label}
          </button>
        ))}
        <button type="button" className="sched-color-swatch is-none" aria-pressed={!currentId} onClick={() => setMyColor(uid, null)}>
          None
        </button>
      </div>
    </section>
  )
}

// Nobody sees the schedule without logging in. An account belongs to the
// barista whose record carries its uid (linked at sign-up).
export default function BaristaApp() {
  const [user, setUser] = useState(undefined)
  useEffect(() => watchAuth(setUser), [])

  if (user === undefined) {
    return <PageFrame marquee="Loading…"><p className="sched-muted">Loading…</p></PageFrame>
  }
  if (!user) {
    return (
      <PageFrame marquee="Welcome to the BRB barista schedule — log in or create your account">
        <AuthPage />
      </PageFrame>
    )
  }
  return <SchedulePortal user={user} />
}

// Logged in, but the account belongs to no barista yet (it was made in another
// BRB app, say): link it by first name, like sign-up does.
function LinkAccountPanel({ email }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await linkAccount(name)
      // The schedule listeners were refused before the link existed; start over.
      window.location.reload()
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <section className="sched-panel auth-window">
      <h3>account.txt</h3>
      <form className="auth-form" onSubmit={onSubmit}>
        <p className="auth-lead">
          You're logged in as <strong>{email}</strong>, but this account isn't linked to anyone on the barista list
          yet. Type your first name to link it.
        </p>
        <label className="sched-field">
          Your first name
          <input autoComplete="given-name" required placeholder="First name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="sched-error">{error}</p>}
        <button type="submit" className="sched-btn sched-btn-primary sched-btn-block" disabled={busy}>
          {busy ? 'Linking…' : 'Link my account'}
        </button>
        <button type="button" className="sched-btn sched-btn-block" onClick={signOut}>Log out</button>
      </form>
    </section>
  )
}

function SchedulePortal({ user }) {
  const data = useScheduleData()
  const [tab, setTab] = useState('schedule')
  const [picking, setPicking] = useState(null)
  const [month, setMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  const me = data.baristas.find((barista) => barista.uid === user.uid) || null
  const meId = me?.id

  const barRight = (
    <span className="barista-me">
      <span>{me ? me.name : user.email}</span>
      <button type="button" className="barista-logout" onClick={signOut}>Log out</button>
    </span>
  )

  const todayKey = dateKey(new Date())
  // Whole days off, for the "off" mark on the schedule. Shift-level limits
  // show up in the shift pop-up instead.
  const myOffDates = useMemo(
    () => new Set(data.unavailability.filter((entry) => entry.baristaId === meId && entry.allDay !== false).map((entry) => entry.date)),
    [data.unavailability, meId]
  )
  const myUpcoming = useMemo(
    () => data.assignments
      .filter((entry) => entry.baristaId === meId && entry.date >= todayKey)
      .sort((left, right) => left.date.localeCompare(right.date) || left.shift.localeCompare(right.shift))
      .slice(0, 10),
    [data.assignments, meId, todayKey]
  )

  // Until the account is linked the rules refuse the schedule itself, so don't
  // wait for it - the barista list is enough to know.
  if (data.baristasLoaded && !me) {
    return <PageFrame barRight={barRight} marquee="Welcome to the BRB barista schedule"><LinkAccountPanel email={user.email} /></PageFrame>
  }
  if (data.loading) {
    return <PageFrame barRight={barRight} marquee="Loading the schedule…"><p className="sched-muted">Loading schedule…</p></PageFrame>
  }

  return (
    <PageFrame
      barRight={barRight}
      marquee={me ? `Hi ${me.name.split(' ')[0]}! Tap a shift to add yourself.` : 'Welcome to the BRB barista schedule'}
    >
      {data.error && (
        <p className="sched-error">
          {data.error} <button type="button" className="sched-link-btn" onClick={data.clearError}>Dismiss</button>
        </p>
      )}

      {!me ? (
        <LinkAccountPanel email={user.email} />
      ) : (
        <>
          <nav className="barista-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'is-active' : ''} onClick={() => setTab('schedule')}>
              Schedule
            </button>
            <button type="button" role="tab" aria-selected={tab === 'availability'} className={tab === 'availability' ? 'is-active' : ''} onClick={() => setTab('availability')}>
              My availability
            </button>
          </nav>

          {tab === 'schedule' ? (
            <>
              <MonthNav month={month} onChange={setMonth} />
              <Legend />
              <ScheduleCalendar
                month={month}
                assignmentsByDate={data.assignmentsByDate}
                onPick={(date, shift, focusId) => setPicking({ date, shift, focusId })}
                myId={me.id}
                offDates={myOffDates}
                timesFor={data.timesFor}
                colors={data.colors}
                lockPast
              />
              <section className="sched-panel">
                <h3>My next shifts</h3>
                {myUpcoming.length === 0 ? (
                  <p className="sched-muted">You have no upcoming shifts.</p>
                ) : (
                  <ul className="barista-upcoming">
                    {myUpcoming.map((entry) => (
                      <li key={entry.id} className={`sched-bubble-${entry.shift}`}>
                        <strong>{formatDay(entry.date)}</strong> · {SHIFTS[entry.shift].label} <small>{formatRange(data.timesFor(entry.date, entry.shift))}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <ColorPanel uid={user.uid} current={data.colors[me.id]} />
            </>
          ) : (
            <>
              <section className="sched-panel">
                <h3>my-usual-week.txt</h3>
                <WeeklyAvailability barista={me} weekly={data.weekly} assignments={data.assignments} />
              </section>
              <section className="sched-panel">
                <h3>specific-dates.cal</h3>
                <MonthNav month={month} onChange={setMonth} />
                <AvailabilityCalendar
                  month={month}
                  barista={me}
                  dateEntries={data.unavailability}
                  weekly={data.weekly}
                  availabilityOf={data.availabilityOf}
                  assignments={data.assignments}
                />
              </section>
            </>
          )}
        </>
      )}

      {picking && me && (
        <ShiftPicker
          date={picking.date}
          shift={picking.shift}
          lists={pickerLists({ ...data, date: picking.date, shift: picking.shift })}
          focusId={picking.focusId}
          me={me}
          hours={data.timesFor(picking.date, picking.shift)}
          onAssign={async (barista) => {
            if (barista.id === me.id && (await assignShift(picking.date, picking.shift, me, me.name))) setPicking(null)
          }}
          onRemove={async (entry) => {
            if (entry.baristaId !== me.id) return
            const ok = window.confirm(
              `Drop your ${SHIFTS[entry.shift].label} shift on ${formatDay(entry.date)}? It opens up again and the managers are told so they can find cover.`
            )
            if (ok && (await dropShift(entry, me))) setPicking(null)
          }}
          onMove={async (entry, toShift) => {
            if (entry.baristaId === me.id && (await moveShift(entry, toShift, me.name, { alertAs: me }))) setPicking(null)
          }}
          readOnly={picking.date < todayKey}
          onClose={() => setPicking(null)}
        />
      )}
    </PageFrame>
  )
}
