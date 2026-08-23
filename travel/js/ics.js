/* Calendar export. This is the reliable reminder path — browser notifications
   only fire while the app is open, so anything that matters goes here. */

import { parseLocal, hasTime, pad } from './derive.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/* Content lines are folded at 75 octets, continuation lines start with a space. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (curLen + len > limit) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch; curLen += len;
  }
  if (cur) out.push(cur);
  return out[0] + out.slice(1).map((s) => '\r\n ' + s).join('');
}

function dtLocal(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}
function dtDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
function stampUTC(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function alarm(leadMinutes, title) {
  if (!(typeof leadMinutes === 'number' && leadMinutes > 0)) return [];
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    `TRIGGER:-PT${Math.round(leadMinutes)}M`,
    'END:VALARM'
  ];
}

/* One VEVENT. `when` is a local Date; times are floating (no TZID), which is
   what you want for a plan you are living in your own timezone. */
function vevent({ uid, title, when, endWhen, allDay, location, description, leadMinutes, stamp }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`];
  if (allDay) {
    const next = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${dtDate(when)}`);
    lines.push(`DTEND;VALUE=DATE:${dtDate(endWhen || next)}`);
  } else {
    lines.push(`DTSTART:${dtLocal(when)}`);
    if (endWhen) lines.push(`DTEND:${dtLocal(endWhen)}`);
  }
  lines.push(`SUMMARY:${esc(title || '(uten tittel)')}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  lines.push(...alarm(leadMinutes, title));
  lines.push('END:VEVENT');
  return lines;
}

function wrap(lines) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//webapps//travel//NO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
    .concat(lines, ['END:VCALENDAR'])
    .map(fold).join('\r\n') + '\r\n';
}

function eventLines(ev, stamp, tripName) {
  const when = parseLocal(ev.start);
  if (!when) return [];
  const desc = [ev.notes, ev.forPerson ? `For: ${ev.forPerson}` : '', ev.reason ? `Grunnlag: ${ev.reason}` : '', tripName ? `Tur: ${tripName}` : '']
    .filter(Boolean).join('\n');
  return vevent({
    uid: `${ev.id}@webapps.travel`,
    title: ev.title,
    when,
    endWhen: parseLocal(ev.end),
    allDay: ev.allDay || !hasTime(ev.start),
    location: ev.location,
    description: desc,
    leadMinutes: ev.leadMinutes,
    stamp
  });
}

function entryLines(entry, list, stamp, tripName) {
  const when = parseLocal(entry.due);
  if (!when) return [];
  const desc = [
    list ? `Liste: ${list.title}${list.groupHint ? ' / ' + list.groupHint : ''}` : '',
    entry.forPerson ? `For: ${entry.forPerson}` : '',
    entry.derived ? 'Frist utledet av appen, ikke oppgitt.' : '',
    entry.reason ? `Grunnlag: ${entry.reason}` : '',
    tripName ? `Tur: ${tripName}` : ''
  ].filter(Boolean).join('\n');
  return vevent({
    uid: `${entry.id}@webapps.travel`,
    title: entry.text,
    when,
    endWhen: hasTime(entry.due) ? new Date(when.getTime() + 15 * 60000) : null,
    allDay: !hasTime(entry.due),
    description: desc,
    leadMinutes: entry.leadMinutes,
    stamp
  });
}

export function icsForEvent(ev, tripName) {
  return wrap(eventLines(ev, stampUTC(), tripName));
}

export function icsForEntry(entry, list, tripName) {
  return wrap(entryLines(entry, list, stampUTC(), tripName));
}

/* Whole trip: every event, plus every entry that has a due. */
export function icsForTrip(trip) {
  const stamp = stampUTC();
  const lines = [];
  (trip.events || []).forEach((ev) => lines.push(...eventLines(ev, stamp, trip.name)));
  (trip.lists || []).forEach((l) => {
    if (l.archived) return;
    l.entries.forEach((en) => lines.push(...entryLines(en, l, stamp, trip.name)));
  });
  return { ics: wrap(lines), count: lines.filter((l) => l === 'BEGIN:VEVENT').length };
}

export function slugify(s) {
  return String(s || 'tur').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tur';
}

export function downloadICS(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
