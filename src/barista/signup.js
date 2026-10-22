// Sign-up rules, kept pure so schedule.test.mjs can run them under node.
//
// A barista can only create an account if the first name they type matches a
// barista the manager added in Staff Management, and that barista has no
// account yet. Matching ignores case, extra spaces and accents. When two
// baristas share a first name, typing the full name picks between them.

export const normalizeName = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const firstWord = (name) => normalizeName(name).split(' ')[0]

/**
 * { barista } when exactly one active, unlinked barista has this first name
 * (or this full name, when the first name is shared); otherwise { error } with
 * a message for the sign-up form.
 */
export const matchBaristaForSignup = (baristas, typedName) => {
  const wanted = normalizeName(typedName)
  if (!wanted) return { error: 'Enter your first name.' }

  const active = baristas.filter((barista) => barista.active !== false)
  const matches = active.filter((barista) => firstWord(barista.name) === firstWord(wanted))
  if (matches.length === 0) {
    return { error: "We couldn't find that name on the barista list. Ask the manager to add you." }
  }
  let unlinked = matches.filter((barista) => !barista.uid)
  if (unlinked.length === 0) {
    return { error: 'There is already an account for that name. Log in instead, or use "Forgot password".', taken: true }
  }
  if (unlinked.length > 1 && wanted.includes(' ')) {
    const exact = unlinked.filter((barista) => normalizeName(barista.name) === wanted)
    if (exact.length > 0) unlinked = exact
  }
  if (unlinked.length > 1) {
    return {
      error: wanted.includes(' ')
        ? 'More than one barista has that name. Ask the manager to set up your account.'
        : 'More than one barista has that first name. Type your first and last name.',
    }
  }
  return { barista: unlinked[0] }
}

export const validateSignupForm = ({ email, password, confirm }) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) return 'Enter a valid email address.'
  if (String(password || '').length < 6) return 'Password must be at least 6 characters.'
  if (password !== confirm) return "The passwords don't match."
  return null
}

// Firebase auth error codes -> what the form says.
export const authErrorMessage = (error) => {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Log in instead.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match."
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return "Can't reach the server. Check your connection."
    default:
      return error?.message || 'Something went wrong. Please try again.'
  }
}
