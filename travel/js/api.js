/* The one API call. Analysis, group detection and gap suggestion all happen here,
   in a single request per capture. Everything after this — projecting entries onto
   the timeline, blocked state, the status strip, filtering neverSuggest — is local
   synchronous code. */

import { API_URL, API_VERSION, MAX_IMAGE_PX, IMAGE_QUALITY, MAX_GROUPS_PER_CAPTURE, MAX_GAPS_PER_CAPTURE, MIN_GROUP_MATCHES } from './config.js';
import { state, getApiKey } from './store.js';
import { parseTolerant, shapeAnalysis } from './parse.js';
import { pad } from './derive.js';

export class ApiError extends Error {
  constructor(message, kind) { super(message); this.kind = kind || 'unknown'; }
}

const SYSTEM = `You extract structure from a person's messy notes about a plan or trip.
You are the parser inside a personal organiser. Return ONE JSON object and nothing else:
no prose, no markdown, no code fence.

SHAPE — every key must be present, empty array if nothing applies:
{
  "tripName": "",
  "tripKind": "",
  "events": [ { "ref":"E1", "title":"", "start":"", "end":"", "allDay":false, "location":"",
                "hard":false, "leadMinutes":null, "forPerson":"", "notes":"", "reason":"", "derived":false } ],
  "lists":  [ { "ref":"L1", "kind":"packing|todo|shopping|generic", "title":"", "groupHint":"",
                "entries":[ { "ref":"N1", "text":"", "qty":null, "forPerson":"", "due":"",
                              "leadMinutes":null, "derived":false, "dependsOn":[], "reason":"" } ] } ],
  "vault":  [ { "ref":"V1", "kind":"field|note",
                "category":"identity|booking|money|medical|connectivity|emergency|note|other",
                "label":"", "value":"", "expires":"", "note":"", "reason":"" } ],
  "people": [],
  "detectedGroups": [ { "groupName":"", "confidence":0.0, "matchedMembers":[],
                        "missingMembers":[ { "text":"", "reason":"" } ] } ],
  "questions": []
}

REFS AND DEPENDENCIES
- Give every event, list and entry you create a short unique "ref" (E1, L1, N1 …).
- "dependsOn" holds refs of things that must be finished first. It may also hold an id
  from EXISTING ITEMS below. Direct links only — never a chain.
- The pattern that matters is ACQUIRE THEN USE: "buy more stomach medicine" (a task) and
  "stomach medicine" (on the packing list) are one thing in two states. Link the packing
  entry to the buying task.

TIME
- Never invent a date or time that is not stated or derivable. Use "" instead.
- Format: "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD" with "allDay": true. Resolve "tonight",
  "tomorrow" and bare clock times against the current local date and time given below.
- "hard": true only for a moment that can actually be missed — a departure, a pick-up
  time, a closing door. Not for a task.

BACKWARD PLANNING — derived deadlines
- When the notes imply tasks that must happen before an event, give each task a "due"
  worked backwards from that event, set "derived": true, and explain it in "reason".
- Spread them sensibly instead of stacking them all on the same minute.
- A task with its own real-world constraint the event does not have — a shop that closes,
  an office with opening hours — is scheduled EARLIER than the rest, and "reason" says why.
  If the constraint is likely but the actual hours are unknown, say so in "reason" rather
  than inventing a time.
- A timed event somewhere else implies leaving earlier. If the tasks happen at one place
  and the next hard event is at another, the real cut-off is departure, not the event.
  You cannot know the travel time: derive the deadlines against the event, and say in
  "reason" that they must in fact be finished before leaving. If the journey looks
  significant, ask for the travel time as a question instead.
- A stated time is not necessarily the destination. A pick-up on the way is a waypoint,
  and the trip may continue afterwards to somewhere the notes never name.

STRUCTURAL POSITION BEATS GRAMMATICAL FORM — the rule most often got wrong
- A line sitting inside a packing block is a packing item even when it reads as a verb.
  Norwegian packing lists are elliptical. Under a heading like "Til barna", the line
  "Børste hedda" means A HAIRBRUSH FOR HEDDA — not "go and brush Hedda's hair".
  Keep the person's original wording as "text", infer "forPerson": "Hedda", and do NOT
  promote it to a task. Only read a line inside a list block as an action when it cannot
  possibly be an object.
- Headings inside a list ("Til meg", "Til barna") become "groupHint" on separate list
  objects, and set "forPerson" on their entries where the heading names someone.

SPLITTING
- Split distinct things into distinct objects. One sentence can yield one event and three
  tasks. Do not merge, do not summarise.
- Reference values — passport number, booking reference, wifi password, policy number,
  seat, gate, PIN-free card details, phone numbers — go in "vault", never into a note body.
  "kind":"note" is for prose worth keeping; its "label" is the title and "value" the body.

LANGUAGE
- Preserve the source language in every title, entry text, list title and label.
  Norwegian input produces Norwegian output. Never translate the person's own words.
  "reason" is explanation you are writing, so match the input language there too.

QUESTIONS — at most three
- Surface real ambiguity instead of guessing.
- A packing list implies a destination. If the notes contain things to bring but never say
  where they are going, that is a genuine gap: ask it. Do not assume the destination is the
  last place mentioned — an address in the text may be a stop on the way, not the endpoint.
- Prefer questions about things genuinely absent over second-guessing wording that is
  already clear. Norwegian "hente" means collect/pick up and is unambiguous — never ask
  whether it is drop-off or pick-up. Same for "levere" (drop off).

TRIP NAME
- "tripName" is a proposal only, and the person will confirm or replace it. Never name the
  trip after a waypoint when the destination is unstated — propose something honest and
  neutral instead. "tripKind" is a short free-text kind ("hytte", "cruise", "hiking").

PACKING GROUPS
- Detect groups by ITEM OVERLAP with the saved groups listed below, not by keywords, and
  not by your own general knowledge of what people pack. Match across languages and
  synonyms: "headset" / "hodetelefoner" / "headphones" are the same member.
- Propose a group only when at least ${MIN_GROUP_MATCHES} of its members match.
  At most ${MAX_GROUPS_PER_CAPTURE} groups, at most ${MAX_GAPS_PER_CAPTURE} missing members in total.
- "missingMembers" are saved members of that group absent from these notes. Each needs a
  reason naming the group. Never invent a member that is not in the saved group.
- Never propose anything in NEVER SUGGEST below.
- Trip kind and event types are secondary signals only.

PEOPLE
- "people" lists the names of people appearing in the notes, exactly as written.

Return valid JSON only.`;

function fmtLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/* The context block. Groups are short text lists, so all of them are sent. */
export function buildContext(trip, library, now = new Date()) {
  const lines = [];
  lines.push('TRIP CONTEXT');
  lines.push(`- name: ${trip?.name || '(unnamed)'}`);
  lines.push(`- kind: ${trip?.kind || '(not set)'}`);
  lines.push(`- dates: ${trip?.start || '(none)'} → ${trip?.end || '(none)'}`);
  lines.push(`- known people: ${(trip?.people || []).map((p) => p.name).join(', ') || '(none yet)'}`);
  lines.push(`- now: ${fmtLocal(now)} (${WD[now.getDay()]}), timezone offset ${-now.getTimezoneOffset()} min`);

  const events = (trip?.events || []).filter((e) => !e.done).slice(0, 40);
  const entries = [];
  (trip?.lists || []).forEach((l) => l.entries.forEach((e) => { if (!e.done) entries.push({ e, l }); }));

  lines.push('');
  lines.push('EXISTING ITEMS — reference these ids in dependsOn; do not duplicate them');
  if (!events.length && !entries.length) lines.push('- (none)');
  events.forEach((e) => lines.push(`- event ${e.id}: ${e.title}${e.start ? ' @ ' + e.start : ''}${e.hard ? ' [hard]' : ''}`));
  entries.slice(0, 80).forEach(({ e, l }) => lines.push(`- entry ${e.id}: ${e.text} (list: ${l.title}${l.groupHint ? ' / ' + l.groupHint : ''})`));

  lines.push('');
  lines.push('SAVED PACKING GROUPS — the person curated these; they are the memory');
  const groups = library?.groups || [];
  if (!groups.length) lines.push('- (none saved yet, so detectedGroups must be empty)');
  groups.forEach((g) => {
    const members = g.members.map((m) => m.text + (m.qty ? ` x${m.qty}` : '') + (m.forPerson ? ` (${m.forPerson})` : '')).join(', ');
    lines.push(`- ${g.name}: ${members}`);
  });

  lines.push('');
  lines.push('NEVER SUGGEST — rejected before, never propose again');
  const never = library?.neverSuggest || [];
  lines.push(never.length ? '- ' + never.join(', ') : '- (empty)');

  return lines.join('\n');
}

/* ---------- images ---------- */

/* Downscaled client-side before sending. Images are input to interpret; they are
   dropped once the review screen is accepted. */
export function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, data: dataUrl.split(',')[1] || '', mediaType: 'image/jpeg' });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(new ApiError('Klarte ikke å lese bildet.', 'image'));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ApiError('Klarte ikke å lese bildet.', 'image')); };
    img.src = url;
  });
}

/* ---------- the call ---------- */

function friendlyError(status, body) {
  const msg = String((body && body.error && body.error.message) || '').toLowerCase();
  if (status === 401 || status === 403) return new ApiError('API-nøkkelen ble avvist. Sjekk den i Innstillinger.', 'auth');
  if (status === 429) return new ApiError('For mange forespørsler akkurat nå. Prøv igjen om et minutt.', 'rate');
  if (status === 400 && msg.includes('credit')) return new ApiError('Kontoen er tom for kreditt. Fyll på hos Anthropic og prøv igjen.', 'credit');
  if (status === 400 && msg.includes('image')) return new ApiError('Bildet ble ikke godtatt. Prøv et mindre eller tydeligere bilde.', 'image');
  if (status === 400) return new ApiError('Forespørselen ble avvist. Teksten er lagret, så ingenting er tapt.', 'request');
  if (status === 404) return new ApiError('Modellen finnes ikke for denne nøkkelen. Velg en annen modell i Innstillinger.', 'model');
  if (status === 413) return new ApiError('For mye innhold i ett opptak. Del det opp, eller send færre bilder.', 'size');
  if (status === 529 || status === 503) return new ApiError('Tjenesten er overbelastet. Prøv igjen om litt.', 'overloaded');
  if (status >= 500) return new ApiError('Noe gikk galt hos Anthropic. Prøv igjen om litt.', 'server');
  return new ApiError('Uventet svar fra API-et. Teksten er lagret.', 'unknown');
}

/* Resolves to { analysis, raw, repaired, usage }. Throws ApiError with a
   plain-language message. */
export async function analyseCapture({ text, images = [], trip, library, model, signal }) {
  const key = getApiKey();
  if (!key) throw new ApiError('Ingen API-nøkkel lagret. Legg den inn i Innstillinger.', 'nokey');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('Ingen nett. Opptaket er lagret og kan analyseres senere.', 'offline');
  }

  const content = [];
  images.forEach((img) => {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.data } });
  });
  const ctx = buildContext(trip, library);
  const body = text && text.trim()
    ? `${ctx}\n\nNOTES FROM THE PERSON — extract from this:\n"""\n${text.trim()}\n"""`
    : `${ctx}\n\nThe input is the image or images above. Extract from what is written in them.`;
  content.push({ type: 'text', text: body });

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || state.settings.model,
        max_tokens: 8000,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content }]
      })
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ApiError('Analysen ble avbrutt.', 'abort');
    throw new ApiError('Fikk ikke kontakt med nettet. Opptaket er lagret og kan analyseres senere.', 'offline');
  }

  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch (e) { /* body may not be JSON */ }
    throw friendlyError(res.status, payload);
  }

  let payload;
  try { payload = await res.json(); }
  catch (e) { throw new ApiError('Svaret fra API-et kunne ikke leses.', 'unknown'); }

  const raw = (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = parseTolerant(raw);
  if (!parsed.ok) throw new ApiError(parsed.error + ' Teksten er lagret, så ingenting er tapt.', 'parse');

  return {
    analysis: shapeAnalysis(parsed.data),
    raw,
    repaired: parsed.repaired,
    truncated: payload.stop_reason === 'max_tokens',
    usage: payload.usage || null
  };
}
