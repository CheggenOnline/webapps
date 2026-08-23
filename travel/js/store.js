/* Storage. Two top-level stores plus settings, all namespaced. Every access is
   wrapped — localStorage throws in private mode and when full, and the app must
   still render with no stored value. */

import { NS, KEY_STORE, DEFAULT_MODEL, MODELS } from './config.js';
import { newTrip, normLibrary, nowISO } from './model.js';

const K_TRIPS = NS + 'trips';
const K_LIBRARY = NS + 'library';
const K_SETTINGS = NS + 'settings';

let storageBroken = false;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = JSON.parse(raw);
    return val === null || val === undefined ? fallback : val;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    storageBroken = true;
    return false;
  }
}

export function storageFailed() { return storageBroken; }

function defSettings() {
  return {
    activeTripId: '',
    model: DEFAULT_MODEL,
    stripExpanded: false,
    lastScreen: 'timeline',
    keyWarningSeen: false
  };
}

export const state = {
  trips: readJSON(K_TRIPS, []).map(newTrip),
  library: normLibrary(readJSON(K_LIBRARY, {})),
  settings: { ...defSettings(), ...readJSON(K_SETTINGS, {}) }
};

if (!MODELS.some((m) => m.id === state.settings.model)) state.settings.model = DEFAULT_MODEL;

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* a broken view must not stop the rest */ } }); }

export function saveTrips() { writeJSON(K_TRIPS, state.trips); }
export function saveLibrary() { writeJSON(K_LIBRARY, state.library); }
export function saveSettings() { writeJSON(K_SETTINGS, state.settings); }

/* Mutate + persist + notify. `scope` limits what is written. */
export function commit(scope = 'trips') {
  if (scope === 'trips' || scope === 'all') saveTrips();
  if (scope === 'library' || scope === 'all') saveLibrary();
  if (scope === 'settings' || scope === 'all') saveSettings();
  emit();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  commit('settings');
}

/* ---------- trips ---------- */

export function activeTrips() { return state.trips.filter((t) => !t.archivedAt); }
export function archivedTrips() { return state.trips.filter((t) => t.archivedAt); }

export function activeTrip() {
  const byId = state.trips.find((t) => t.id === state.settings.activeTripId);
  if (byId) return byId;
  const first = activeTrips()[0] || state.trips[0] || null;
  if (first && first.id !== state.settings.activeTripId) {
    state.settings.activeTripId = first.id;
    saveSettings();
  }
  return first;
}

export function selectTrip(id) {
  state.settings.activeTripId = id;
  commit('settings');
}

export function addTrip(patch) {
  const trip = newTrip(patch);
  state.trips.unshift(trip);
  state.settings.activeTripId = trip.id;
  commit('all');
  return trip;
}

export function deleteTrip(id) {
  const i = state.trips.findIndex((t) => t.id === id);
  if (i < 0) return;
  state.trips.splice(i, 1);
  if (state.settings.activeTripId === id) state.settings.activeTripId = '';
  activeTrip();
  commit('all');
}

export function archiveTrip(id, archived) {
  const trip = state.trips.find((t) => t.id === id);
  if (!trip) return;
  trip.archivedAt = archived ? nowISO() : null;
  commit('trips');
}

/* ---------- people ---------- */

export function ensurePeople(trip, names) {
  let added = 0;
  (names || []).forEach((name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    const exists = trip.people.some((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (!exists) { trip.people.push({ id: 'p_' + Math.random().toString(36).slice(2, 9), name: clean }); added += 1; }
  });
  return added;
}

/* ---------- library ---------- */

export function addNeverSuggest(normalised) {
  if (!normalised) return;
  if (!state.library.neverSuggest.includes(normalised)) state.library.neverSuggest.push(normalised);
  saveLibrary();
}

export function bumpDismiss(normalised) {
  if (!normalised) return 0;
  const next = (state.library.dismissCounts[normalised] || 0) + 1;
  state.library.dismissCounts[normalised] = next;
  saveLibrary();
  return next;
}

/* ---------- api key ---------- */

export function getApiKey() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (!raw) return '';
    if (raw.startsWith('"')) { try { return JSON.parse(raw) || ''; } catch (e) { return ''; } }
    return raw;
  } catch (e) { return ''; }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, JSON.stringify(key));
    else localStorage.removeItem(KEY_STORE);
    return true;
  } catch (e) { return false; }
}

/* ---------- backup ---------- */

export function exportBackup() {
  return {
    app: 'webapps.travel',
    backupVersion: 1,
    exportedAt: nowISO(),
    trips: state.trips,
    library: state.library,
    settings: { model: state.settings.model }
  };
}

/* Returns { trips, groups } counts, or throws with a plain-language message. */
export function importBackup(raw, mode = 'merge') {
  let data;
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { throw new Error('Filen er ikke gyldig JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('Filen inneholder ingen data.');
  if (!Array.isArray(data.trips) && !data.library) throw new Error('Fant verken turer eller bibliotek i filen.');

  const trips = (Array.isArray(data.trips) ? data.trips : []).map(newTrip);
  const lib = normLibrary(data.library || {});

  if (mode === 'replace') {
    state.trips = trips;
    state.library = lib;
  } else {
    const ids = new Set(state.trips.map((t) => t.id));
    trips.forEach((t) => { if (!ids.has(t.id)) state.trips.push(t); });
    const gnames = new Set(state.library.groups.map((g) => g.name.toLowerCase()));
    lib.groups.forEach((g) => { if (!gnames.has(g.name.toLowerCase())) state.library.groups.push(g); });
    lib.neverSuggest.forEach((n) => { if (!state.library.neverSuggest.includes(n)) state.library.neverSuggest.push(n); });
    Object.entries(lib.dismissCounts).forEach(([k, v]) => {
      state.library.dismissCounts[k] = Math.max(state.library.dismissCounts[k] || 0, v);
    });
  }
  if (data.settings && MODELS.some((m) => m.id === data.settings.model)) state.settings.model = data.settings.model;
  activeTrip();
  commit('all');
  return { trips: trips.length, groups: lib.groups.length };
}

export function wipeAll() {
  state.trips = [];
  state.library = normLibrary({});
  state.settings = defSettings();
  commit('all');
}
