import { useState } from 'react'
import { resetPassword, signIn, signUp } from './baristaAuth.js'
import { validateSignupForm } from './signup.js'

/**
 * What schedule.brbcoffee-atx.com shows until someone is logged in: log in,
 * create an account (only for names on the barista list), or reset a password.
 */
export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const field = (key) => ({
    value: form[key],
    onChange: (event) => setForm({ ...form, [key]: event.target.value }),
  })

  const go = (next) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const run = async (action) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const onLogin = (event) => {
    event.preventDefault()
    run(() => signIn(form.email, form.password))
  }

  const onSignup = (event) => {
    event.preventDefault()
    const problem = validateSignupForm(form)
    if (problem) {
      setError(problem)
      return
    }
    run(() => signUp(form))
  }

  const onReset = (event) => {
    event.preventDefault()
    if (!form.email.trim()) {
      setError('Enter your email first.')
      return
    }
    run(async () => {
      await resetPassword(form.email)
      setNotice(`If ${form.email.trim()} has an account, a reset link is on its way. Check your spam folder too.`)
    })
  }

  const title = { login: 'login.exe', signup: 'create-account.exe', reset: 'forgot-password.exe' }[mode]

  return (
    <section className="sched-panel auth-window">
      <h3>{title}</h3>

      {mode === 'login' && (
        <form className="auth-form" onSubmit={onLogin}>
          <p className="auth-lead">Log in to see the schedule, pick up shifts and set your availability.</p>
          <label className="sched-field">
            Email
            <input type="email" autoComplete="email" required {...field('email')} />
          </label>
          <label className="sched-field">
            Password
            <input type="password" autoComplete="current-password" required {...field('password')} />
          </label>
          {error && <p className="sched-error">{error}</p>}
          <button type="submit" className="sched-btn sched-btn-primary sched-btn-block" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <p className="auth-links">
            <button type="button" className="sched-link-btn" onClick={() => go('reset')}>Forgot password?</button>
          </p>
          <div className="auth-switch">
            <p>New here?</p>
            <button type="button" className="sched-btn" onClick={() => go('signup')}>Create an account</button>
          </div>
        </form>
      )}

      {mode === 'signup' && (
        <form className="auth-form" onSubmit={onSignup}>
          <p className="auth-lead">
            Your name has to be on the BRB barista list. Type it the way the manager entered it — first and last name.
          </p>
          <label className="sched-field">
            Your name
            <input autoComplete="name" required placeholder="First Last" {...field('name')} />
          </label>
          <label className="sched-field">
            Email
            <input type="email" autoComplete="email" required {...field('email')} />
          </label>
          <label className="sched-field">
            Password <small className="sched-muted">at least 6 characters</small>
            <input type="password" autoComplete="new-password" required {...field('password')} />
          </label>
          <label className="sched-field">
            Password again
            <input type="password" autoComplete="new-password" required {...field('confirm')} />
          </label>
          {error && <p className="sched-error">{error}</p>}
          <button type="submit" className="sched-btn sched-btn-primary sched-btn-block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <div className="auth-switch">
            <p>Already have an account?</p>
            <button type="button" className="sched-btn" onClick={() => go('login')}>Log in</button>
          </div>
        </form>
      )}

      {mode === 'reset' && (
        <form className="auth-form" onSubmit={onReset}>
          <p className="auth-lead">Enter the email you signed up with and we'll send a link to choose a new password.</p>
          <label className="sched-field">
            Email
            <input type="email" autoComplete="email" required {...field('email')} />
          </label>
          {error && <p className="sched-error">{error}</p>}
          {notice && <p className="sched-warning">{notice}</p>}
          <button type="submit" className="sched-btn sched-btn-primary sched-btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="auth-links">
            <button type="button" className="sched-link-btn" onClick={() => go('login')}>Back to log in</button>
          </p>
        </form>
      )}
    </section>
  )
}
