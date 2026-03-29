// lib/db.js
import {
  collection, doc,
  getDocs, setDoc, deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ── helpers ──────────────────────────────────────────
function habitsCol(uid)      { return collection(db, 'users', uid, 'habits'); }
function completionsCol(uid) { return collection(db, 'users', uid, 'completions'); }

// ── habits ────────────────────────────────────────────
export async function loadHabits(uid) {
  const snap = await getDocs(habitsCol(uid));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function saveHabit(uid, habit) {
  await setDoc(doc(habitsCol(uid), habit.id), habit);
}

export async function deleteHabit(uid, habitId) {
  await deleteDoc(doc(habitsCol(uid), habitId));
}

// ── completions ───────────────────────────────────────
export async function loadCompletions(uid) {
  const snap = await getDocs(completionsCol(uid));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data().habitIds || []; });
  return map;
}

export async function saveCompletion(uid, dateKey, habitIds) {
  const ref = doc(completionsCol(uid), dateKey);
  if (!habitIds || habitIds.length === 0) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { habitIds });
  }
}

// ── nuke all data for a user (optional) ──────────────
export async function clearUserData(uid) {
  const batch = writeBatch(db);
  const [hSnap, cSnap] = await Promise.all([
    getDocs(habitsCol(uid)),
    getDocs(completionsCol(uid)),
  ]);
  hSnap.docs.forEach(d => batch.delete(d.ref));
  cSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
