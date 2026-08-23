/* Review — the hardest screen in the app. One capture can yield an event, three
   tasks, a list with two headings, nine entries and two vault fields.

   Rules it implements:
   - grouped by object type with a count per group
   - every item individually editable and individually deselectable
   - what the user wrote and what the model inferred look different: inferred
     times, inferred dependencies and group gaps carry a marker and their reason
   - group gaps sit in their own block, never mixed with what he wrote
   - questions render at the top as answer chips and are applied locally
   - nothing is written to the trip until Accept */

import { h, svg, ICON, toast, openSheet, iconBtn } from '../dom.js';
import { state, commit, ensurePeople, bumpDismiss, addNeverSuggest } from '../store.js';
import { newEvent, newEntry, newList, newVault, newSuggestion, normText, uid } from '../model.js';
import { isNeverSuggested, parseLocal, toLocalInput, formatWhen, hasTime, depIndex } from '../derive.js';
import { MAX_GAPS_PER_CAPTURE, MAX_GROUPS_PER_CAPTURE, MIN_GROUP_MATCHES, DISMISS_LIMIT, LIST_KINDS, VAULT_CATEGORIES } from '../config.js';

const PLACEHOLDER_NAMES = ['', 'ny tur', 'travel', 'uten navn'];

function looksUnnamed(trip) {
  return PLACEHOLDER_NAMES.includes(normText(trip.name));
}

/* ---------- build the working model ---------- */

function buildModel(trip, analysis, library) {
  const model = {
    tripName: analysis.tripName || '',
    tripKind: analysis.tripKind || '',
    nameSelected: !!analysis.tripName && looksUnnamed(trip),
    kindSelected: !!analysis.tripKind && !trip.kind,
    events: [],
    lists: [],
    vault: [],
    people: [],
    gaps: [],
    detected: [],
    tripIndex: depIndex(trip),
    questions: (analysis.questions || []).map((q) => ({ q, answer: '', note: '' }))
  };

  (analysis.events || []).forEach((e, i) => {
    model.events.push({
      ref: e.ref || 'E' + i,
      sel: true,
      d: newEvent({ ...e, source: 'analysis' })
    });
  });

  (analysis.lists || []).forEach((l, li) => {
    const entries = (Array.isArray(l.entries) ? l.entries : []).map((en, ni) => ({
      ref: en.ref || `N${li}_${ni}`,
      sel: true,
      d: newEntry({ ...en, source: 'analysis' })
    }));
    model.lists.push({
      ref: l.ref || 'L' + li,
      sel: true,
      kind: LIST_KINDS.some((k) => k.id === l.kind) ? l.kind : 'generic',
      title: String(l.title || 'Liste'),
      groupHint: String(l.groupHint || ''),
      entries
    });
  });

  (analysis.vault || []).forEach((v, i) => {
    model.vault.push({ ref: v.ref || 'V' + i, sel: true, d: newVault({ ...v, source: 'analysis' }) });
  });

  (analysis.people || []).forEach((name) => {
    const known = trip.people.some((p) => normText(p.name) === normText(name));
    model.people.push({ name, sel: !known, known });
  });

  /* Detected groups: threshold of two matched members, at most three groups,
     at most eight gaps in total, and nothing on the neverSuggest list. */
  const detected = (analysis.detectedGroups || [])
    .map((g) => {
      const libGroup = (library.groups || []).find((x) => normText(x.name) === normText(g.groupName));
      return {
        groupName: String(g.groupName || ''),
        groupId: libGroup ? libGroup.id : '',
        confidence: typeof g.confidence === 'number' ? g.confidence : 0,
        matched: (Array.isArray(g.matchedMembers) ? g.matchedMembers : []).map(String).filter(Boolean),
        missing: (Array.isArray(g.missingMembers) ? g.missingMembers : [])
          .map((m) => (typeof m === 'string' ? { text: m, reason: '' } : { text: String(m.text || ''), reason: String(m.reason || '') }))
          .filter((m) => m.text)
      };
    })
    /* Only groups that actually exist in the library and clear the threshold. */
    .filter((g) => g.groupId && g.matched.length >= MIN_GROUP_MATCHES)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_GROUPS_PER_CAPTURE);

  model.detected = detected;

  let budget = MAX_GAPS_PER_CAPTURE;
  detected.forEach((g) => {
    const libGroup = (library.groups || []).find((x) => x.id === g.groupId);
    g.missing.forEach((m) => {
      if (budget <= 0) return;
      if (isNeverSuggested(library, m.text)) return;
      /* Never propose something that is not actually a saved member. */
      const isMember = (libGroup?.members || []).some((mm) => normText(mm.text) === normText(m.text));
      if (!isMember) return;
      const member = (libGroup.members || []).find((mm) => normText(mm.text) === normText(m.text));
      budget -= 1;
      model.gaps.push({
        id: uid('gap'),
        groupId: g.groupId,
        groupName: g.groupName,
        text: member.text,
        qty: member.qty,
        forPerson: member.forPerson,
        reason: m.reason || `På «${g.groupName}»-gruppen din, men ikke i denne notatet.`,
        state: 'none'
      });
    });
  });

  return model;
}

function countSelected(model) {
  let n = 0;
  n += model.events.filter((e) => e.sel).length;
  model.lists.forEach((l) => { if (l.sel) n += l.entries.filter((e) => e.sel).length; });
  n += model.vault.filter((v) => v.sel).length;
  n += model.people.filter((p) => p.sel).length;
  n += model.gaps.filter((g) => g.state === 'add').length;
  if (model.nameSelected && model.tripName) n += 1;
  return n;
}

/* ---------- tiny draft editors ---------- */

function fieldRow(label, control, hint) {
  return h('div', { class: 'field' }, h('label', { text: label }), control, hint ? h('p', { class: 'sub', text: hint }) : null);
}

function editDraftEvent(item, onSave) {
  const d = item.d;
  openSheet({
    title: 'Rediger hendelse',
    build: (body, close) => {
      const title = h('input', { type: 'text', value: d.title });
      const start = h('input', { type: d.allDay ? 'date' : 'datetime-local', value: d.allDay ? d.start.slice(0, 10) : d.start });
      const hard = h('input', { type: 'checkbox', id: 'rh_' + item.ref, checked: d.hard });
      const loc = h('input', { type: 'text', value: d.location });
      const person = h('input', { type: 'text', value: d.forPerson });
      const notes = h('textarea', { value: d.notes });
      body.append(
        fieldRow('Tittel', title),
        fieldRow('Start', start, d.derived ? 'Tiden er utledet av appen. Rett den om den er feil.' : ''),
        h('div', { class: 'check' }, hard, h('label', { for: hard.id, text: 'Hard frist' })),
        fieldRow('Sted', loc),
        fieldRow('For hvem', person),
        fieldRow('Notat', notes),
        d.reason ? h('p', { class: 'reason', text: d.reason }) : null,
        h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
          h('button', {
            type: 'button', class: 'btn', text: 'Ferdig', onClick: () => {
              d.title = title.value.trim() || d.title;
              if (start.value !== (d.allDay ? d.start.slice(0, 10) : d.start)) { d.start = start.value; d.derived = false; }
              d.hard = hard.checked;
              d.location = loc.value.trim();
              d.forPerson = person.value.trim();
              d.notes = notes.value;
              close(); onSave();
            }
          })));
    }
  });
}

function editDraftEntry(item, onSave) {
  const d = item.d;
  openSheet({
    title: 'Rediger linje',
    build: (body, close) => {
      const text = h('input', { type: 'text', value: d.text });
      const qty = h('input', { type: 'number', min: '1', value: d.qty ?? '' });
      const person = h('input', { type: 'text', value: d.forPerson });
      const due = h('input', { type: hasTime(d.due) || !d.due ? 'datetime-local' : 'date', value: d.due });
      body.append(
        fieldRow('Tekst', text),
        h('div', { class: 'field-2' }, fieldRow('Antall', qty), fieldRow('For hvem', person)),
        fieldRow('Frist', due, d.derived ? 'Fristen er regnet baklengs av appen, ikke oppgitt av deg.' : 'Tom frist betyr at linjen ikke havner på tidslinjen.'),
        d.reason ? h('p', { class: 'reason', text: d.reason }) : null,
        h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
          h('button', {
            type: 'button', class: 'btn', text: 'Ferdig', onClick: () => {
              d.text = text.value.trim() || d.text;
              d.qty = qty.value ? Number(qty.value) : null;
              d.forPerson = person.value.trim();
              if (due.value !== d.due) { d.due = due.value; d.derived = false; }
              close(); onSave();
            }
          })));
    }
  });
}

function editDraftVault(item, onSave) {
  const d = item.d;
  openSheet({
    title: 'Rediger oppslag',
    build: (body, close) => {
      const label = h('input', { type: 'text', value: d.label });
      const value = d.kind === 'note' ? h('textarea', { value: d.value }) : h('input', { type: 'text', value: d.value });
      const cat = h('select', {}, ...VAULT_CATEGORIES.map((c) => h('option', { value: c.id, text: c.label, selected: d.category === c.id })));
      const expires = h('input', { type: 'date', value: (d.expires || '').slice(0, 10) });
      body.append(
        fieldRow(d.kind === 'note' ? 'Tittel' : 'Navn', label),
        fieldRow(d.kind === 'note' ? 'Tekst' : 'Verdi', value),
        fieldRow('Kategori', cat),
        fieldRow('Utløper', expires),
        d.reason ? h('p', { class: 'reason', text: d.reason }) : null,
        h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
          h('button', {
            type: 'button', class: 'btn', text: 'Ferdig', onClick: () => {
              d.label = label.value.trim() || d.label;
              d.value = value.value;
              d.category = cat.value;
              d.expires = expires.value;
              close(); onSave();
            }
          })));
    }
  });
}

/* ---------- answering a question, locally ---------- */

function minutesFrom(text) {
  const t = String(text).toLowerCase();
  let total = 0;
  const hours = t.match(/(\d+(?:[.,]\d+)?)\s*(?:t\b|time|timer|hour|hr)/);
  if (hours) total += Math.round(parseFloat(hours[1].replace(',', '.')) * 60);
  const mins = t.match(/(\d+)\s*(?:min|minutt|minutter|minute)/);
  if (mins) total += Number(mins[1]);
  if (!total) {
    const bare = t.match(/^\s*(\d{1,3})\s*$/);
    if (bare) total = Number(bare[1]);
  }
  return total;
}

const DEST_WORDS = ['hvor', 'hvorhen', 'reisemål', 'destinasjon', 'where', 'dit', 'skal dere', 'skal du', 'ender'];
const TRAVEL_WORDS = ['reisetid', 'kjøretid', 'hvor lang tid', 'travel time', 'how long', 'hvor lenge tar'];

/* Returns a short description of what was applied, or '' if only recorded. */
function applyAnswer(model, question, answer) {
  const q = question.toLowerCase();
  const applied = [];

  if (TRAVEL_WORDS.some((w) => q.includes(w))) {
    const mins = minutesFrom(answer);
    if (mins > 0) {
      let moved = 0;
      model.lists.forEach((l) => l.entries.forEach((en) => {
        const at = parseLocal(en.d.due);
        if (!en.d.derived || !at) return;
        const shifted = new Date(at.getTime() - mins * 60000);
        en.d.due = toLocalInput(shifted);
        en.d.reason = (en.d.reason ? en.d.reason + ' ' : '') + `Flyttet ${mins} min tidligere for reisetiden du oppgav.`;
        moved += 1;
      }));
      if (moved) applied.push(`${moved} frister flyttet ${mins} min tidligere`);
    }
  }

  if (DEST_WORDS.some((w) => q.includes(w)) && answer.trim()) {
    model.tripName = answer.trim();
    model.nameSelected = true;
    applied.push('turnavn satt til «' + answer.trim() + '»');
  }

  if (!applied.length && answer.trim()) {
    /* Nothing computable — keep it as a note so the answer is not lost. */
    model.vault.push({
      ref: uid('qv'),
      sel: true,
      fromAnswer: true,
      d: newVault({
        kind: 'note', category: 'note',
        label: question.replace(/\?+$/, '').slice(0, 60),
        value: answer.trim(),
        source: 'analysis',
        reason: 'Svaret ditt på spørsmålet fra analysen.'
      })
    });
    applied.push('lagret som notat');
  }

  return applied.join(', ');
}

/* ---------- accept ---------- */

function findOrCreateList(trip, spec) {
  const found = trip.lists.find((l) => !l.archived
    && normText(l.title) === normText(spec.title)
    && normText(l.groupHint) === normText(spec.groupHint));
  if (found) return found;
  const created = newList({ kind: spec.kind, title: spec.title, groupHint: spec.groupHint });
  trip.lists.push(created);
  return created;
}

function firstPackingList(trip) {
  return trip.lists.find((l) => !l.archived && l.kind === 'packing') || null;
}

function applyModel(trip, model, captureId, sourceText) {
  const summary = [];
  const refMap = new Map();
  const createdEntries = [];

  if (model.nameSelected && model.tripName) { trip.name = model.tripName; summary.push('turnavn'); }
  if (model.kindSelected && model.tripKind) trip.kind = model.tripKind;

  const newPeople = model.people.filter((p) => p.sel).map((p) => p.name);
  const addedPeople = ensurePeople(trip, newPeople);
  if (addedPeople) summary.push(`${addedPeople} personer`);

  let evCount = 0;
  model.events.filter((e) => e.sel).forEach((e) => {
    const ev = newEvent({ ...e.d, id: undefined, source: 'analysis' });
    trip.events.push(ev);
    refMap.set(e.ref, ev.id);
    evCount += 1;
  });
  if (evCount) summary.push(`${evCount} hendelser`);

  let enCount = 0;
  model.lists.forEach((l) => {
    if (!l.sel) return;
    const chosen = l.entries.filter((e) => e.sel);
    if (!chosen.length) return;
    const target = findOrCreateList(trip, l);
    chosen.forEach((e) => {
      const entry = newEntry({ ...e.d, id: undefined, source: 'analysis' });
      target.entries.push(entry);
      refMap.set(e.ref, entry.id);
      createdEntries.push(entry);
      enCount += 1;
    });
  });
  if (enCount) summary.push(`${enCount} linjer`);

  /* Resolve dependsOn: refs from this capture become real ids; ids that already
     existed pass through; anything unresolvable is dropped rather than dangling. */
  const known = new Set();
  trip.events.forEach((e) => known.add(e.id));
  trip.lists.forEach((l) => l.entries.forEach((e) => known.add(e.id)));
  createdEntries.forEach((e) => {
    e.dependsOn = (e.dependsOn || [])
      .map((r) => refMap.get(r) || r)
      .filter((id) => known.has(id) && id !== e.id);
  });

  let vCount = 0;
  model.vault.filter((v) => v.sel).forEach((v) => {
    trip.vault.push(newVault({ ...v.d, id: undefined, source: 'analysis' }));
    vCount += 1;
  });
  if (vCount) summary.push(`${vCount} oppslag`);

  /* Gaps: added, dismissed, or left for later as a pending suggestion. */
  const toAdd = model.gaps.filter((g) => g.state === 'add');
  if (toAdd.length) {
    let target = firstPackingList(trip);
    if (!target) {
      target = newList({ kind: 'packing', title: 'Pakkeliste' });
      trip.lists.push(target);
    }
    toAdd.forEach((g) => {
      target.entries.push(newEntry({
        text: g.text, qty: g.qty, forPerson: g.forPerson,
        groupId: g.groupId, source: 'group', reason: g.reason
      }));
    });
    summary.push(`${toAdd.length} fra grupper`);
  }

  model.gaps.filter((g) => g.state === 'dismiss').forEach((g) => {
    const n = bumpDismiss(normText(g.text));
    if (n >= DISMISS_LIMIT) addNeverSuggest(normText(g.text));
  });

  model.gaps.filter((g) => g.state === 'none').forEach((g) => {
    trip.suggestions.push(newSuggestion({
      kind: 'group-gap',
      payload: { text: g.text, qty: g.qty, forPerson: g.forPerson, groupName: g.groupName },
      reason: g.reason,
      groupId: g.groupId
    }));
  });

  /* A detected group has proved itself useful. */
  model.detected.forEach((d) => {
    const g = state.library.groups.find((x) => x.id === d.groupId);
    if (g) { g.usedCount += 1; g.updatedAt = new Date().toISOString(); }
  });

  const capture = trip.captures.find((c) => c.id === captureId);
  if (capture) {
    capture.resultSummary = summary.length ? summary.join(', ') : 'ingenting tatt i bruk';
    /* Images were input to interpret. They are not kept. */
    capture.imageData = null;
    if (!capture.text && sourceText) capture.text = sourceText;
  }

  commit('all');
  return summary;
}

/* ---------- the screen ---------- */

export function openReview({ trip, analysis, captureId, repaired, sourceText, images, ctx, onAccepted, onCancelled }) {
  const model = buildModel(trip, analysis, state.library);
  let accepted = false;

  const totalFound = model.events.length
    + model.lists.reduce((n, l) => n + l.entries.length, 0)
    + model.vault.length;

  openSheet({
    title: 'Gjennomgang',
    full: true,
    onClose: () => { if (!accepted && onCancelled) onCancelled(); },
    build: (body, close, rerender) => {
      if (repaired) {
        body.appendChild(h('p', { class: 'notice', style: 'border-color:var(--warn)', text: 'Svaret fra modellen var avkuttet og ble reparert. Sjekk om noe mangler før du tar det i bruk.' }));
      }

      if (!totalFound && !model.gaps.length && !model.questions.length) {
        body.append(
          h('div', { class: 'empty' },
            h('strong', { text: 'Fant ingenting å strukturere' }),
            h('p', { text: 'Prøv å skrive litt mer konkret — hva som skjer, når, og hva du må ha med.' })),
          h('div', { class: 'form-foot' },
            h('button', { type: 'button', class: 'btn wide', text: 'Tilbake', onClick: () => close() })));
        return;
      }

      /* --- questions, at the top, as answer chips --- */
      if (model.questions.length) {
        body.appendChild(h('div', { class: 'grp-head', text: 'Spørsmål' }));
        model.questions.forEach((qq, i) => {
          const chip = h('button', {
            type: 'button', class: 'q-chip' + (qq.note ? ' q-answered' : ''),
            onClick: () => {
              if (qq.note) return;
              openSheet({
                title: 'Svar',
                build: (qb, qclose) => {
                  const input = h('input', { type: 'text', value: qq.answer, placeholder: 'Svaret ditt' });
                  qb.append(
                    h('p', { class: 'sub', text: qq.q }),
                    h('div', { class: 'field' }, input),
                    h('p', { class: 'sub', text: 'Svaret brukes med en gang, uten et nytt API-kall.' }),
                    h('div', { class: 'form-foot' },
                      h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => qclose() }),
                      h('button', {
                        type: 'button', class: 'btn', text: 'Bruk svaret', onClick: () => {
                          qq.answer = input.value.trim();
                          if (!qq.answer) { qclose(); return; }
                          qq.note = applyAnswer(model, qq.q, qq.answer) || 'lagret';
                          qclose(); rerender();
                        }
                      })));
                  setTimeout(() => input.focus(), 60);
                }
              });
            }
          },
          h('span', { class: 'q-mark', text: '?' }),
          qq.q,
          qq.note ? h('div', { class: 'row-sub', text: `Svar: ${qq.answer} — ${qq.note}` }) : null);
          body.appendChild(chip);
        });
      }

      /* --- trip name proposal --- */
      if (model.tripName || model.tripKind) {
        const card = h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', { text: 'Turen' }), h('span', { class: 'tag ai', text: 'forslag' })));
        if (model.tripName) {
          const input = h('input', {
            type: 'text', value: model.tripName,
            style: 'width:100%;min-height:40px;padding:0 10px;background:var(--bg);border:1px solid var(--line);border-radius:10px'
          });
          input.addEventListener('input', () => { model.tripName = input.value; });
          card.appendChild(h('div', { class: 'sel-row' },
            selBox(model.nameSelected, () => { model.nameSelected = !model.nameSelected; rerender(); }),
            h('div', { class: 'sel-body' },
              h('div', { class: 'row-title', style: 'font-size:.82rem;color:var(--muted)', text: `Navn (nå: ${trip.name})` }),
              input,
              h('div', { class: 'reason', text: 'Forslag fra analysen. Bekreft eller skriv over — reisemålet står ofte ikke i teksten.' }))));
        }
        if (model.tripKind) {
          card.appendChild(h('div', { class: 'sel-row' },
            selBox(model.kindSelected, () => { model.kindSelected = !model.kindSelected; rerender(); }),
            h('div', { class: 'sel-body' },
              h('div', { class: 'row-title', text: 'Type: ' + model.tripKind }),
              h('div', { class: 'reason', text: 'Typen styrer gjenkjenning av pakkegrupper senere.' }))));
        }
        body.appendChild(card);
      }

      /* --- events --- */
      if (model.events.length) {
        body.appendChild(section('Hendelser', model.events.filter((e) => e.sel).length, model.events.length,
          () => { const all = model.events.every((e) => e.sel); model.events.forEach((e) => { e.sel = !all; }); rerender(); },
          model.events.map((item) => selRow({
            sel: item.sel,
            toggle: () => { item.sel = !item.sel; rerender(); },
            title: item.d.title,
            meta: eventMeta(item.d),
            reason: item.d.reason,
            inferred: item.d.derived,
            onEdit: () => editDraftEvent(item, rerender)
          }))));
      }

      /* --- lists --- */
      model.lists.forEach((l) => {
        const kindLabel = (LIST_KINDS.find((k) => k.id === l.kind) || {}).label || 'Liste';
        const head = l.groupHint ? `${l.title} · ${l.groupHint}` : l.title;
        body.appendChild(section(`${head} (${kindLabel})`, l.entries.filter((e) => e.sel).length, l.entries.length,
          () => { const all = l.entries.every((e) => e.sel); l.entries.forEach((e) => { e.sel = !all; }); rerender(); },
          l.entries.map((item) => selRow({
            sel: item.sel,
            toggle: () => { item.sel = !item.sel; rerender(); },
            title: item.d.text,
            meta: entryMeta(item.d, model),
            reason: item.d.reason,
            inferred: item.d.derived || item.d.dependsOn.length > 0,
            onEdit: () => editDraftEntry(item, rerender),
            onDropDep: item.d.dependsOn.length ? () => { item.d.dependsOn = []; rerender(); } : null
          }))));
      });

      /* --- vault --- */
      if (model.vault.length) {
        body.appendChild(section('Oppslag og notater', model.vault.filter((v) => v.sel).length, model.vault.length,
          () => { const all = model.vault.every((v) => v.sel); model.vault.forEach((v) => { v.sel = !all; }); rerender(); },
          model.vault.map((item) => selRow({
            sel: item.sel,
            toggle: () => { item.sel = !item.sel; rerender(); },
            title: item.d.label,
            sub: item.d.kind === 'note' ? item.d.value.slice(0, 120) : item.d.value,
            meta: [h('span', { class: 'tag', text: (VAULT_CATEGORIES.find((c) => c.id === item.d.category) || {}).label || 'Annet' })],
            reason: item.d.reason,
            inferred: false,
            onEdit: () => editDraftVault(item, rerender)
          }))));
      }

      /* --- people --- */
      if (model.people.length) {
        body.appendChild(section('Folk', model.people.filter((p) => p.sel).length, model.people.length,
          () => { const all = model.people.every((p) => p.sel); model.people.forEach((p) => { p.sel = !all; }); rerender(); },
          model.people.map((p) => selRow({
            sel: p.sel,
            toggle: () => { p.sel = !p.sel; rerender(); },
            title: p.name,
            meta: p.known ? [h('span', { class: 'tag', text: 'kjent fra før' })] : [],
            inferred: false
          }))));
      }

      /* --- group gaps, in their own block per group --- */
      const byGroup = new Map();
      model.gaps.forEach((g) => {
        if (!byGroup.has(g.groupName)) byGroup.set(g.groupName, []);
        byGroup.get(g.groupName).push(g);
      });
      byGroup.forEach((gaps, groupName) => {
        const card = h('div', { class: 'card gap-card' },
          h('div', { class: 'card-head' },
            h('h2', {}, 'Fra gruppen «', groupName, '»'),
            h('span', { class: 'count', text: `${gaps.length} mangler` })));
        card.appendChild(h('div', { class: 'card-body', style: 'padding-bottom:0' },
          h('p', { class: 'sub', style: 'margin:0', text: 'Dette står på gruppen din, men ikke i notatet. Huk av for å legge til, eller kryss ut for å slutte å foreslå det.' })));
        gaps.forEach((g) => {
          card.appendChild(h('div', { class: 'sel-row' + (g.state === 'dismiss' ? ' off' : '') },
            selBox(g.state === 'add', () => { g.state = g.state === 'add' ? 'none' : 'add'; rerender(); }),
            h('div', { class: 'sel-body' },
              h('div', { class: 'row-title' }, g.text, g.qty ? h('span', { class: 'tag', style: 'margin-left:6px', text: '×' + g.qty }) : null,
                g.forPerson ? h('span', { class: 'tag person', style: 'margin-left:6px', text: g.forPerson }) : null),
              h('div', { class: 'reason', text: g.reason }),
              g.state === 'dismiss'
                ? h('div', { class: 'row-sub', text: ((state.library.dismissCounts[normText(g.text)] || 0) + 1 >= DISMISS_LIMIT) ? 'Blir aldri foreslått igjen.' : 'Avvist. Foreslås én gang til.' })
                : null),
            h('button', {
              type: 'button', class: 'copy', 'aria-label': 'Slutt å foreslå ' + g.text,
              onClick: () => { g.state = g.state === 'dismiss' ? 'none' : 'dismiss'; rerender(); }
            }, g.state === 'dismiss' ? svg(ICON.check, 16) : svg(ICON.close, 16))));
        });
        body.appendChild(card);
      });

      const untouched = model.gaps.filter((g) => g.state === 'none').length;

      /* --- footer --- */
      const n = countSelected(model);
      body.appendChild(h('div', { class: 'review-foot' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
        h('button', {
          type: 'button', class: 'btn', style: 'flex:1 1 auto', disabled: n === 0,
          text: n ? `Ta i bruk (${n})` : 'Ingenting valgt',
          onClick: () => {
            const summary = applyModel(trip, model, captureId, sourceText);
            accepted = true;
            close();
            if (onAccepted) onAccepted();
            toast(summary.length ? 'Lagt til: ' + summary.join(', ') : 'Ingenting ble lagt til');
            ctx.go(model.events.some((e) => e.sel) ? 'timeline' : 'lists');
          }
        })));
      if (untouched) {
        body.appendChild(h('p', { class: 'sub', style: 'text-align:center', text: `${untouched} gruppeforslag du ikke har svart på blir liggende som forslag.` }));
      }
      body.appendChild(h('p', { class: 'sub', style: 'text-align:center', text: 'Ingenting lagres i turen før du tar det i bruk. Lilla merking betyr utledet av appen.' }));
    }
  });
}

/* ---------- row helpers ---------- */

function selBox(on, toggle) {
  return h('button', {
    type: 'button', class: 'tick', 'aria-pressed': String(!!on), 'aria-label': on ? 'Velg bort' : 'Velg',
    style: 'flex:none', onClick: toggle
  }, svg(ICON.check, 17));
}

function section(title, selCount, total, toggleAll, rows) {
  const card = h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { text: title }),
      h('span', { class: 'count', text: `${selCount}/${total}` }),
      h('button', { type: 'button', class: 'btn quiet sm', text: selCount === total ? 'Ingen' : 'Alle', onClick: toggleAll })));
  rows.forEach((r) => card.appendChild(r));
  return card;
}

function selRow({ sel, toggle, title, sub, meta = [], reason, inferred, onEdit, onDropDep }) {
  return h('div', { class: 'sel-row' + (sel ? '' : ' off') },
    selBox(sel, toggle),
    h('div', { class: 'sel-body' },
      h('div', { class: 'row-title' }, title, inferred ? h('span', { class: 'tag derived', style: 'margin-left:6px', text: 'utledet' }) : null),
      sub ? h('div', { class: 'row-sub', style: 'font-family:ui-monospace,Menlo,monospace', text: sub }) : null,
      meta.length ? h('div', { class: 'row-sub' }, ...meta) : null,
      reason ? h('div', { class: 'reason', text: reason }) : null,
      onDropDep ? h('button', { type: 'button', class: 'btn quiet sm', style: 'margin-top:6px', text: 'Fjern avhengigheten', onClick: onDropDep }) : null),
    onEdit ? iconBtn('pencil', 'Rediger', onEdit, 'copy') : null);
}

function eventMeta(d) {
  const out = [];
  if (d.start) out.push(h('span', { class: 'tag' + (d.derived ? ' derived' : ''), text: formatWhen(parseLocal(d.start), d.allDay || !hasTime(d.start)) }));
  else out.push(h('span', { class: 'tag', text: 'uten tid' }));
  if (d.hard) out.push(h('span', { class: 'tag hard', text: 'hard frist' }));
  if (d.location) out.push(h('span', { class: 'tag', text: d.location }));
  if (d.forPerson) out.push(h('span', { class: 'tag person', text: d.forPerson }));
  return out;
}

function entryMeta(d, model) {
  const out = [];
  if (d.qty) out.push(h('span', { class: 'tag', text: '×' + d.qty }));
  if (d.forPerson) out.push(h('span', { class: 'tag person', text: d.forPerson }));
  if (d.due) out.push(h('span', { class: 'tag' + (d.derived ? ' derived' : ''), text: formatWhen(parseLocal(d.due), !hasTime(d.due)) }));
  if (d.dependsOn.length) {
    const labels = d.dependsOn.map((ref) => labelForRef(ref, model)).filter(Boolean);
    out.push(h('span', { class: 'tag dep', text: 'venter på ' + (labels.join(', ') || 'noe annet') }));
  }
  return out;
}

function labelForRef(ref, model) {
  const ev = model.events.find((e) => e.ref === ref);
  if (ev) return ev.d.title;
  let found = '';
  model.lists.forEach((l) => l.entries.forEach((e) => { if (e.ref === ref) found = e.d.text; }));
  if (found) return found;
  /* The model may also depend on something already in the trip, by real id. */
  const existing = model.tripIndex.get(ref);
  return existing ? existing.label : '';
}
