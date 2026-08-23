/* Everything derived from stored data. All of it is local, synchronous and
   deterministic — the app never calls the API to recompute something it has
   already stored, and every one of these must work offline. */

import { normText } from './model.js';

/* ---------- time ---------- */

/* 'YYYY-MM-DD' is parsed as UTC by the Date constructor, which shifts the day
   in a negative offset. Parse by hand so a date-only value stays that date. */
export function parseLocal(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

export function hasTime(value) { return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value || ''); }

export function pad(n) { return String(n).padStart(2, '0'); }

export function toLocalInput(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTime(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

export function formatDayLabel(date, now = new Date()) {
  const k = dayKey(date);
  if (k === dayKey(now)) return 'I dag';
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (k === dayKey(t)) return 'I morgen';
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (k === dayKey(y)) return 'I går';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

export function formatWhen(date, allDay) {
  if (!date) return '';
  return allDay ? formatDayLabel(date) : `${formatDayLabel(date)} ${formatTime(date)}`;
}

/* "om 2 t 15 min" / "12 min på overtid" */
export function countdown(ms) {
  const late = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  let text;
  if (d > 0) text = `${d} d ${h} t`;
  else if (h > 0) text = `${h} t ${pad(m)} min`;
  else text = `${m} min`;
  return late ? `${text} på overtid` : `om ${text}`;
}

/* ---------- timeline ---------- */

/* Events, plus every Entry that has a `due`. Entries live in lists AND are
   projected here — that is the distinction the data model turns on. */
export function timelineItems(trip) {
  if (!trip) return [];
  const items = [];

  trip.events.forEach((ev) => {
    const when = parseLocal(ev.start);
    if (!when) return;
    items.push({
      key: 'event:' + ev.id,
      type: 'event',
      obj: ev,
      when,
      allDay: ev.allDay || !hasTime(ev.start),
      done: ev.done,
      title: ev.title
    });
  });

  trip.lists.forEach((list) => {
    if (list.archived) return;
    list.entries.forEach((en) => {
      const when = parseLocal(en.due);
      if (!when) return;
      items.push({
        key: 'entry:' + en.id,
        type: 'entry',
        obj: en,
        list,
        when,
        allDay: !hasTime(en.due),
        done: en.done,
        title: en.text
      });
    });
  });

  items.sort((a, b) => {
    const diff = a.when - b.when;
    if (diff) return diff;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.title.localeCompare(b.title, 'nb');
  });
  return items;
}

export function groupByDay(items, now = new Date()) {
  const days = [];
  let current = null;
  items.forEach((it) => {
    const k = dayKey(it.when);
    if (!current || current.key !== k) {
      current = { key: k, date: it.when, label: formatDayLabel(it.when, now), isToday: k === dayKey(now), items: [] };
      days.push(current);
    }
    current.items.push(it);
  });
  return days;
}

export function nextItem(items, now = new Date()) {
  return items.find((it) => !it.done && it.when >= now) || null;
}

export function nextHardDeadline(trip, now = new Date()) {
  let best = null;
  (trip?.events || []).forEach((ev) => {
    if (!ev.hard || ev.done) return;
    const when = parseLocal(ev.start);
    if (!when || when < now) return;
    if (!best || when < best.when) best = { when, obj: ev, type: 'event' };
  });
  return best;
}

/* ---------- dependencies ---------- */

/* Direct links only — no graph, no cascade. */
export function depIndex(trip) {
  const map = new Map();
  (trip?.events || []).forEach((ev) => map.set(ev.id, { done: ev.done, label: ev.title, type: 'event' }));
  (trip?.lists || []).forEach((l) => l.entries.forEach((en) => map.set(en.id, { done: en.done, label: en.text, type: 'entry' })));
  return map;
}

export function blockersOf(entry, index) {
  if (!entry?.dependsOn?.length) return [];
  return entry.dependsOn.map((id) => index.get(id)).filter((t) => t && !t.done);
}

export function isBlocked(entry, index) { return blockersOf(entry, index).length > 0; }

export function blockedCount(trip) {
  const index = depIndex(trip);
  let n = 0;
  (trip?.lists || []).forEach((l) => {
    if (l.archived) return;
    l.entries.forEach((en) => { if (!en.done && isBlocked(en, index)) n += 1; });
  });
  return n;
}

/* ---------- lists ---------- */

export function listProgress(list) {
  const total = list.entries.length;
  const done = list.entries.filter((e) => e.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* groupHint is a list-level field, so "one packing list with two headings" is
   two List objects sharing a title. Group them back together by title so the
   user sees one list with headings inside it, and one combined count. */
export function listGroups(trip, includeArchived = false) {
  const out = [];
  const map = new Map();
  (trip?.lists || []).forEach((l) => {
    if (!includeArchived && l.archived) return;
    const key = normText(l.title) || l.id;
    if (!map.has(key)) {
      const g = { key, title: l.title, kind: l.kind, lists: [], done: 0, total: 0 };
      map.set(key, g);
      out.push(g);
    }
    const g = map.get(key);
    g.lists.push(l);
    g.total += l.entries.length;
    g.done += l.entries.filter((e) => e.done).length;
  });
  out.forEach((g) => { g.pct = g.total ? Math.round((g.done / g.total) * 100) : 0; });
  return out;
}

export function openListGroups(trip) {
  return listGroups(trip).filter((g) => g.total && g.done < g.total);
}

/* ---------- suggestions ---------- */

export function pendingSuggestions(trip) {
  return (trip?.suggestions || []).filter((s) => s.status === 'pending');
}

/* ---------- rejection memory ---------- */

export function isNeverSuggested(library, text) {
  const n = normText(text);
  if (!n) return false;
  return (library?.neverSuggest || []).includes(n);
}

/* ---------- vault ---------- */

export function expiryState(entry, now = new Date()) {
  const d = parseLocal(entry?.expires);
  if (!d) return '';
  const days = Math.floor((d - now) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 180) return 'expiring';
  return '';
}

export function expiryLabel(entry, now = new Date()) {
  const d = parseLocal(entry?.expires);
  if (!d) return '';
  const days = Math.floor((d - now) / 86400000);
  if (days < 0) return `utløpt ${Math.abs(days)} d siden`;
  if (days === 0) return 'utløper i dag';
  if (days <= 60) return `utløper om ${days} d`;
  return `utløper ${d.getDate()}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* ---------- status strip ---------- */

export function statusInfo(trip, now = new Date()) {
  if (!trip) return { primary: { text: 'Ingen tur valgt', tone: '' }, chips: [] };

  const items = timelineItems(trip);
  const hard = nextHardDeadline(trip, now);
  const next = nextItem(items, now);

  let primary;
  if (hard) {
    primary = {
      text: `<b>${escapeHTML(hard.obj.title)}</b> ${escapeHTML(countdown(hard.when - now))}`,
      tone: (hard.when - now) < 3 * 3600000 ? 'hard' : 'soon',
      go: { screen: 'timeline', focus: 'event:' + hard.obj.id }
    };
  } else if (next) {
    primary = {
      text: `<b>${escapeHTML(next.title)}</b> ${escapeHTML(next.allDay ? formatDayLabel(next.when, now) : countdown(next.when - now))}`,
      tone: 'calm',
      go: { screen: 'timeline', focus: next.key }
    };
  } else {
    const undated = countUndated(trip);
    primary = {
      text: undated ? `Ingenting med tid. <b>${undated}</b> ting uten dato.` : 'Ingenting planlagt ennå',
      tone: '',
      go: { screen: undated ? 'lists' : 'capture' }
    };
  }

  const chips = [];
  openListGroups(trip).forEach((g) => {
    chips.push({ text: `${escapeHTML(g.title)} <b>${g.done}/${g.total}</b>`, go: { screen: 'lists', focus: 'list:' + g.lists[0].id } });
  });
  const blocked = blockedCount(trip);
  if (blocked) chips.push({ text: `<b>${blocked}</b> blokkert`, alert: true, go: { screen: 'lists' } });
  const pend = pendingSuggestions(trip).length;
  if (pend) chips.push({ text: `<b>${pend}</b> forslag`, alert: true, go: { screen: 'suggestions' } });
  const drafts = (trip.captures || []).filter((c) => !c.resultSummary).length;
  if (drafts) chips.push({ text: `<b>${drafts}</b> ikke analysert`, alert: true, go: { screen: 'captures' } });

  return { primary, chips };
}

export function countUndated(trip) {
  let n = 0;
  (trip?.lists || []).forEach((l) => { if (!l.archived) l.entries.forEach((e) => { if (!e.done && !e.due) n += 1; }); });
  return n;
}

/* ---------- search ---------- */

export function searchTrip(trip, query) {
  const q = normText(query);
  if (!q || !trip) return [];
  const hit = (s) => normText(s).includes(q);
  const out = [];
  trip.events.forEach((ev) => {
    if (hit(ev.title) || hit(ev.location) || hit(ev.notes) || hit(ev.forPerson)) {
      out.push({ kind: 'Hendelse', label: ev.title, sub: ev.start || 'uten tid', go: { screen: 'timeline', focus: 'event:' + ev.id } });
    }
  });
  trip.lists.forEach((l) => {
    if (hit(l.title) || hit(l.groupHint)) out.push({ kind: 'Liste', label: l.title, sub: l.groupHint, go: { screen: 'lists', focus: 'list:' + l.id } });
    l.entries.forEach((en) => {
      if (hit(en.text) || hit(en.forPerson) || hit(en.reason)) {
        out.push({ kind: l.title, label: en.text, sub: en.forPerson, go: { screen: 'lists', focus: 'entry:' + en.id } });
      }
    });
  });
  trip.vault.forEach((v) => {
    if (hit(v.label) || hit(v.value) || hit(v.note)) {
      out.push({ kind: v.kind === 'note' ? 'Notat' : 'Oppslag', label: v.label, sub: v.kind === 'note' ? '' : v.value, go: { screen: 'vault', focus: 'vault:' + v.id } });
    }
  });
  trip.people.forEach((p) => {
    if (hit(p.name)) out.push({ kind: 'Person', label: p.name, sub: '', go: { screen: 'lists' } });
  });
  return out;
}

export function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
