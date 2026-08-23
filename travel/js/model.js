/* Factories and normalisation. Every object that reaches storage goes through
   one of these, so a field added later cannot be undefined on old data. */

let counter = 0;
export function uid(prefix = 'i') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const bool = (v) => v === true;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : v === 0 ? 0 : null);
const arr = (v) => (Array.isArray(v) ? v : []);

export function nowISO() { return new Date().toISOString(); }

export function newTrip(patch = {}) {
  return {
    id: patch.id || uid('t'),
    name: str(patch.name) || 'Ny tur',
    kind: str(patch.kind),
    start: str(patch.start),
    end: str(patch.end),
    createdAt: patch.createdAt || nowISO(),
    archivedAt: patch.archivedAt || null,
    people: arr(patch.people).map(normPerson),
    events: arr(patch.events).map(normEvent),
    lists: arr(patch.lists).map(normList),
    vault: arr(patch.vault).map(normVault),
    suggestions: arr(patch.suggestions).map(normSuggestion),
    captures: arr(patch.captures).map(normCapture)
  };
}

export function normPerson(p) {
  if (typeof p === 'string') return { id: uid('p'), name: p };
  return { id: p?.id || uid('p'), name: str(p?.name) };
}

export function newEvent(patch = {}) { return normEvent({ id: uid('e'), ...patch }); }

export function normEvent(e = {}) {
  return {
    id: e.id || uid('e'),
    title: str(e.title),
    start: str(e.start),
    end: str(e.end),
    allDay: bool(e.allDay),
    location: str(e.location),
    hard: bool(e.hard),
    leadMinutes: num(e.leadMinutes),
    done: bool(e.done),
    forPerson: str(e.forPerson),
    notes: str(e.notes),
    source: e.source === 'analysis' ? 'analysis' : 'manual',
    reason: str(e.reason),
    derived: bool(e.derived)
  };
}

export function newList(patch = {}) { return normList({ id: uid('l'), ...patch }); }

export function normList(l = {}) {
  const kinds = ['packing', 'todo', 'shopping', 'generic'];
  return {
    id: l.id || uid('l'),
    kind: kinds.includes(l.kind) ? l.kind : 'generic',
    title: str(l.title) || 'Liste',
    groupHint: str(l.groupHint),
    archived: bool(l.archived),
    entries: arr(l.entries).map(normEntry)
  };
}

export function newEntry(patch = {}) { return normEntry({ id: uid('n'), ...patch }); }

export function normEntry(n = {}) {
  return {
    id: n.id || uid('n'),
    text: str(n.text),
    done: bool(n.done),
    qty: num(n.qty),
    forPerson: str(n.forPerson),
    due: str(n.due),
    leadMinutes: num(n.leadMinutes),
    derived: bool(n.derived),
    dependsOn: arr(n.dependsOn).map(str).filter(Boolean),
    groupId: str(n.groupId),
    source: ['analysis', 'group'].includes(n.source) ? n.source : 'manual',
    reason: str(n.reason)
  };
}

export function newVault(patch = {}) { return normVault({ id: uid('v'), ...patch }); }

export function normVault(v = {}) {
  const cats = ['identity', 'booking', 'money', 'medical', 'connectivity', 'emergency', 'note', 'other'];
  return {
    id: v.id || uid('v'),
    kind: v.kind === 'note' ? 'note' : 'field',
    category: cats.includes(v.category) ? v.category : (v.kind === 'note' ? 'note' : 'other'),
    label: str(v.label),
    value: str(v.value),
    expires: str(v.expires),
    note: str(v.note),
    source: v.source === 'analysis' ? 'analysis' : 'manual',
    reason: str(v.reason)
  };
}

export function newSuggestion(patch = {}) { return normSuggestion({ id: uid('s'), ...patch }); }

export function normSuggestion(s = {}) {
  const kinds = ['entry-add', 'event-add', 'group-save', 'group-gap', 'vault-add'];
  return {
    id: s.id || uid('s'),
    kind: kinds.includes(s.kind) ? s.kind : 'entry-add',
    payload: s.payload && typeof s.payload === 'object' ? s.payload : {},
    reason: str(s.reason),
    groupId: str(s.groupId),
    status: ['accepted', 'dismissed'].includes(s.status) ? s.status : 'pending',
    createdAt: s.createdAt || nowISO()
  };
}

export function newCapture(patch = {}) { return normCapture({ id: uid('c'), ...patch }); }

export function normCapture(c = {}) {
  return {
    id: c.id || uid('c'),
    at: c.at || nowISO(),
    inputType: c.inputType === 'image' ? 'image' : 'text',
    text: str(c.text),
    resultSummary: str(c.resultSummary),
    /* Images are input to interpret, not content to keep. Cleared on accept. */
    imageData: Array.isArray(c.imageData) && c.imageData.length ? c.imageData : null
  };
}

export function newGroup(patch = {}) { return normGroup({ id: uid('g'), ...patch }); }

export function normGroup(g = {}) {
  return {
    id: g.id || uid('g'),
    name: str(g.name),
    members: arr(g.members).map((m) => ({
      text: str(typeof m === 'string' ? m : m?.text),
      qty: num(m?.qty),
      forPerson: str(m?.forPerson)
    })).filter((m) => m.text),
    usedCount: typeof g.usedCount === 'number' ? g.usedCount : 0,
    createdAt: g.createdAt || nowISO(),
    updatedAt: g.updatedAt || nowISO()
  };
}

export function normLibrary(lib = {}) {
  return {
    groups: arr(lib.groups).map(normGroup),
    neverSuggest: arr(lib.neverSuggest).map(str).filter(Boolean),
    /* Not in the spec's model but required by the rejection-memory rule:
       the count of dismissals per normalised item text. */
    dismissCounts: lib.dismissCounts && typeof lib.dismissCounts === 'object' ? { ...lib.dismissCounts } : {}
  };
}

/* Normalised form used for rejection memory and duplicate checks. */
export function normText(s) {
  return str(s).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
