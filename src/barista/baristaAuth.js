// Barista accounts on Firebase Auth.
//
// An account is tied to one barista record: signing up writes the barista's
// uid and email onto baristas/{id} (the rules only allow that while it has no
// uid) and creates the scheduleUsers/{uid} gate the rules check.

import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { authErrorMessage, matchBaristaForSignup } from './signup.js'

const friendly = (error) => new Error(authErrorMessage(error))

// callback({ uid, email } | null)
export const watchAuth = (callback) =>
  onAuthStateChanged(auth, (user) => callback(user ? { uid: user.uid, email: user.email } : null))

export const signIn = async (email, password) => {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch (error) {
    throw friendly(error)
  }
}

export const signOut = () => firebaseSignOut(auth)

export const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (error) {
    throw friendly(error)
  }
}

const findBarista = async (name, { takenError } = {}) => {
  const snapshot = await getDocs(collection(db, 'baristas'))
  const baristas = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  const { barista, error, taken } = matchBaristaForSignup(baristas, name)
  if (error) throw new Error(taken && takenError ? takenError : error)
  return barista
}

const link = async (barista, uid, email) => {
  await updateDoc(doc(db, 'baristas', barista.id), { uid, email, linkedAt: serverTimestamp() })
  await setDoc(doc(db, 'scheduleUsers', uid), {
    uid,
    baristaId: barista.id,
    baristaName: barista.name,
    email,
    createdAt: serverTimestamp(),
  })
}

// For someone already logged in whose account belongs to no barista (made in
// another BRB app, or in the Firebase console): link it by name.
export const linkAccount = async (name) => {
  const barista = await findBarista(name, {
    takenError:
      'That name is already linked to a different login. Log out and log in with that one, or ask the manager to unlink it.',
  })
  try {
    await link(barista, auth.currentUser.uid, auth.currentUser.email)
  } catch (err) {
    console.error('Linking the account failed', err)
    throw new Error('Could not link your account to your name. Please try again, or ask the manager.')
  }
  return barista
}

// The account is created before the name is matched: the barista list is
// only readable signed in, so it can't be checked from the logged-out form.
export const signUp = async ({ name, email, password }) => {
  const address = email.trim()
  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, address, password)
  } catch (err) {
    throw friendly(err)
  }

  let barista
  try {
    barista = await findBarista(name)
  } catch (err) {
    // No barista by that name (or already linked): don't leave the account behind.
    await deleteUser(credential.user).catch(() => {})
    throw err
  }

  try {
    await link(barista, credential.user.uid, address)
  } catch (err) {
    // Someone linked this barista first (or the write was refused): don't leave
    // an account behind that belongs to nobody.
    console.error('Linking the new account failed', err)
    await deleteUser(credential.user).catch(() => {})
    throw new Error('Could not link your account to your name. Please try again, or ask the manager.')
  }
  return barista
}
