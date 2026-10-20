// Sign-up rules, kept pure so schedule.test.mjs can run them under node.
//
// A barista can only create an account if the name they type matches a
// barista the manager added in Staff Management, and that barista has no
// account yet. Matching ignores case, extra spaces and accents. A typed full
// name also matches a list entry that is only that first name.

export const normalizeName = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * { barista } when exactly one active, unlinked barista has this name;
 * otherwise { error } with a message for the sign-up form.
 */
export const matchBaristaForSignup = (baristas, typedName) => {
  const wanted = normalizeName(typedName)
  if (!wanted) return { error: 'Enter your name.' }

  const active = baristas.filter((barista) => barista.active !== false)
  let matches = active.filter((barista) => normalizeName(barista.name) === wanted)
  // Staff Management often only has a first name (names imported from calendar
  // entries like "[Ana, Opening]"), so a full name also matches an entry that is
  // just its first name - as long as exactly one barista has that first name.
  if (matches.length === 0 && wanted.includes(' ')) {
    const first = wanted.split(' ')[0]
    matches = active.filter((barista) => normalizeName(barista.name) === first)
  }
  if (matches.length === 0) {
    return {
      error:
        "We couldn't find that name on the barista list. Use your full name the way the manager entered it, or ask them to add you.",
    }
  }
  const unlinked = matches.filter((barista) => !barista.uid)
  if (unlinked.length === 0) {
    return { error: 'There is already an account for that name. Log in instead, or use "Forgot password".' }
  }
  if (unlinked.length > 1) {
    return { error: 'More than one barista has that name. Ask the manager to set up your account.' }
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
