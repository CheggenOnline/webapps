/* Tolerant JSON parsing.

   Models do return truncated or slightly malformed JSON, and a missing closing
   brace must never lose the whole capture. Three escalating attempts:
     1. strip code fences and surrounding prose, parse as-is
     2. repair — close an unterminated string, drop a half-written member,
        balance the open brackets
     3. truncate to the last complete element inside the innermost container
   See ./parse.test.js for the malformed fixtures this is tested against. */

export function stripFences(raw) {
  let s = String(raw == null ? '' : raw).trim();
  /* ```json … ``` or ``` … ``` — possibly unterminated. */
  s = s.replace(/^`{3,}[a-zA-Z0-9_-]*\s*/, '');
  s = s.replace(/\s*`{3,}\s*$/, '');
  s = s.trim();
  /* Prose before or after the object. Keep from the first brace; the scan
     below decides where it ends. */
  const first = s.indexOf('{');
  if (first > 0) s = s.slice(first);
  return s.trim();
}

const OPEN = { '{': 'obj', '[': 'arr' };
const CLOSE = { '}': 'obj', ']': 'arr' };

/* Walk the text once, tracking the container stack. For each container we keep
   `lastComplete` — the offset just past the last fully-written member — which is
   what truncation rewinds to. */
export function scan(s) {
  const stack = [];
  let inStr = false, esc = false, strWasKey = false;
  let i = 0;
  const top = () => stack[stack.length - 1];

  function valueEnded(end) {
    const t = top();
    if (t) { t.lastComplete = end; t.expect = 'comma'; }
  }

  while (i < s.length) {
    const c = s[i];

    if (inStr) {
      if (esc) { esc = false; i += 1; continue; }
      if (c === '\\') { esc = true; i += 1; continue; }
      if (c === '"') {
        inStr = false;
        const t = top();
        if (t && t.type === 'obj' && strWasKey) t.expect = 'colon';
        else valueEnded(i + 1);
      }
      i += 1;
      continue;
    }

    if (c === '"') {
      const t = top();
      strWasKey = !!(t && t.type === 'obj' && t.expect === 'key');
      inStr = true;
      i += 1;
      continue;
    }

    if (OPEN[c]) {
      stack.push({ type: OPEN[c], start: i, lastComplete: i + 1, expect: OPEN[c] === 'obj' ? 'key' : 'value' });
      i += 1;
      continue;
    }

    if (CLOSE[c]) {
      if (stack.length && top().type === CLOSE[c]) {
        stack.pop();
        valueEnded(i + 1);
      }
      i += 1;
      continue;
    }

    if (c === ':') { const t = top(); if (t) t.expect = 'value'; i += 1; continue; }
    if (c === ',') { const t = top(); if (t) t.expect = t.type === 'obj' ? 'key' : 'value'; i += 1; continue; }
    if (/\s/.test(c)) { i += 1; continue; }

    /* number, true, false, null — or garbage. Consume to the next delimiter. */
    let j = i;
    while (j < s.length && !/[\s,{}\[\]:"]/.test(s[j])) j += 1;
    const token = s.slice(i, j);
    const complete = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)$/.test(token);
    /* A token flush against the end of input may have been cut mid-way, so it
       only counts as complete when something follows it. */
    if (complete && j < s.length) valueEnded(j);
    i = j;
  }

  return { stack, inStr, strWasKey, length: s.length };
}

function closersFor(stack) {
  return stack.slice().reverse().map((f) => (f.type === 'obj' ? '}' : ']')).join('');
}

function dropTrailingSeparator(s) {
  return s.replace(/[,:]\s*$/, '');
}

/* Candidate repairs, cheapest first. */
export function repairCandidates(s) {
  const out = [];
  const info = scan(s);
  if (!info.stack.length && !info.inStr) return out;

  /* 1 — close what is open, keeping the tail. */
  if (info.inStr) {
    if (info.strWasKey) {
      /* A half-written key carries no value: rewind past it. */
      const t = info.stack[info.stack.length - 1];
      out.push(dropTrailingSeparator(s.slice(0, t.lastComplete)) + closersFor(info.stack));
    } else {
      out.push(s + '"' + closersFor(info.stack));
    }
  } else {
    const t = info.stack[info.stack.length - 1];
    const tail = s.slice(t ? t.lastComplete : 0);
    /* Nothing half-written after the last complete member → just close up. */
    if (/^[\s]*$/.test(tail) || /^\s*,\s*$/.test(tail)) {
      out.push(dropTrailingSeparator(s.slice(0, t.lastComplete)) + closersFor(info.stack));
    } else {
      out.push(dropTrailingSeparator(s) + closersFor(info.stack));
    }
  }

  /* 2 — truncate to the last complete element of the innermost container,
     then of each container outwards. */
  for (let d = info.stack.length - 1; d >= 0; d -= 1) {
    const frame = info.stack[d];
    const cut = dropTrailingSeparator(s.slice(0, frame.lastComplete));
    out.push(cut + closersFor(info.stack.slice(0, d + 1)));
  }

  return out.filter((c, idx, all) => c && all.indexOf(c) === idx);
}

/* Returns { ok, data, repaired, error }. Never throws. */
export function parseTolerant(raw) {
  const s = stripFences(raw);
  if (!s) return { ok: false, data: null, repaired: false, error: 'Tomt svar fra modellen.' };

  try {
    return { ok: true, data: JSON.parse(s), repaired: false, error: '' };
  } catch (e) { /* fall through to repair */ }

  /* A trailing comma is common enough to be worth one cheap pass. */
  const decommaed = s.replace(/,\s*([}\]])/g, '$1');
  if (decommaed !== s) {
    try { return { ok: true, data: JSON.parse(decommaed), repaired: true, error: '' }; } catch (e) { /* keep going */ }
  }

  for (const candidate of repairCandidates(s)) {
    try {
      const data = JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
      if (data && typeof data === 'object') return { ok: true, data, repaired: true, error: '' };
    } catch (e) { /* try the next candidate */ }
  }

  return { ok: false, data: null, repaired: false, error: 'Klarte ikke å lese svaret fra modellen.' };
}

/* Coerce whatever survived into the shape the review screen expects. Missing
   keys become empty collections rather than errors. */
export function shapeAnalysis(data) {
  const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const strings = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
  return {
    events: list(obj.events),
    lists: list(obj.lists),
    vault: list(obj.vault),
    people: strings(obj.people),
    detectedGroups: list(obj.detectedGroups),
    questions: strings(obj.questions).slice(0, 3),
    tripName: typeof obj.tripName === 'string' ? obj.tripName.trim() : '',
    tripKind: typeof obj.tripKind === 'string' ? obj.tripKind.trim() : ''
  };
}
