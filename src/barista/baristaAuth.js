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

export const signUp = async ({ name, email, password }) => {
  const snapshot = await getDocs(collection(db, 'baristas'))
  const baristas = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  const { barista, error } = matchBaristaForSignup(baristas, name)
  if (error) throw new Error(error)

  const address = email.trim()
  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, address, password)
  } catch (err) {
    throw friendly(err)
  }

  const { uid } = credential.user
  try {
    await updateDoc(doc(db, 'baristas', barista.id), { uid, email: address, linkedAt: serverTimestamp() })
    await setDoc(doc(db, 'scheduleUsers', uid), {
      uid,
      baristaId: barista.id,
      baristaName: barista.name,
      email: address,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    // Someone linked this barista first (or the write was refused): don't leave
    // an account behind that belongs to nobody.
    console.error('Linking the new account failed', err)
    await deleteUser(credential.user).catch(() => {})
    throw new Error('Could not link your account to your name. Please try again, or ask the manager.')
  }
  return barista
}
