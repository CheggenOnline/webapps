/* Manual create/edit forms. Typing into forms is the fallback path, not the main
   one, but everything the capture screen can produce must also be editable here. */

import { h, openSheet, confirmSheet, toast, iconBtn, svg, ICON } from '../dom.js';
import { commit, addTrip, deleteTrip, archiveTrip } from '../store.js';
import { newEvent, newEntry, newList, newVault, uid } from '../model.js';
import { depIndex, hasTime } from '../derive.js';
import { LIST_KINDS, VAULT_CATEGORIES } from '../config.js';
import { icsForEvent, icsForEntry, downloadICS, slugify } from '../ics.js';

const LEADS = [
  { v: '', label: 'Ingen' },
  { v: '10', label: '10 min før' },
  { v: '30', label: '30 min før' },
  { v: '60', label: '1 time før' },
  { v: '120', label: '2 timer før' },
  { v: '360', label: '6 timer før' },
  { v: '1440', label: '1 døgn før' }
];

function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', { text: label }), control, hint ? h('p', { class: 'sub', text: hint }) : null);
}

function leadSelect(value) {
  const sel = h('select', {},
    ...LEADS.map((l) => h('option', { value: l.v, text: l.label, selected: String(value ?? '') === l.v })));
  if (value != null && !LEADS.some((l) => l.v === String(value))) {
    sel.appendChild(h('option', { value: String(value), text: `${value} min før`, selected: true }));
  }
  return sel;
}

function personInput(trip, value) {
  const input = h('input', { type: 'text', value: value || '', placeholder: 'valgfritt', list: 'people-' + trip.id });
  const dl = h('datalist', { id: 'people-' + trip.id }, ...trip.people.map((p) => h('option', { value: p.name })));
  return h('div', {}, input, dl);
}
const valueOf = (wrap) => wrap.querySelector('input,textarea,select').value;

function footer(onSave, onCancel, extra) {
  return h('div', { class: 'form-foot' },
    h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: onCancel }),
    h('button', { type: 'button', class: 'btn', text: 'Lagre', onClick: onSave }),
    extra || null);
}

/* ---------- event ---------- */

export function editEvent(trip, existing, onDone) {
  const ev = existing || newEvent({ source: 'manual' });
  const isNew = !existing;

  openSheet({
    title: isNew ? 'Ny hendelse' : 'Rediger hendelse',
    build: (body, close) => {
      const title = h('input', { type: 'text', value: ev.title, placeholder: 'Hva skjer?', enterkeyhint: 'next' });
      const allDay = h('input', { type: 'checkbox', id: 'ad_' + ev.id, checked: ev.allDay || (!!ev.start && !hasTime(ev.start)) });
      const startBox = h('div', { class: 'field' });
      const endBox = h('div', { class: 'field' });

      const renderTimes = () => {
        const dateOnly = allDay.checked;
        const s = h('input', { type: dateOnly ? 'date' : 'datetime-local', value: dateOnly ? (ev.start || '').slice(0, 10) : ev.start });
        const e = h('input', { type: dateOnly ? 'date' : 'datetime-local', value: dateOnly ? (ev.end || '').slice(0, 10) : ev.end });
        startBox.replaceChildren(h('label', { text: 'Start' }), s,
          h('p', { class: 'sub', text: 'La stå tomt hvis tiden ikke er kjent. Appen finner ikke opp tider.' }));
        endBox.replaceChildren(h('label', { text: 'Slutt' }), e);
      };
      allDay.addEventListener('change', renderTimes);
      renderTimes();

      const location = h('input', { type: 'text', value: ev.location, placeholder: 'valgfritt' });
      const hard = h('input', { type: 'checkbox', id: 'hd_' + ev.id, checked: ev.hard });
      const lead = leadSelect(ev.leadMinutes);
      const person = personInput(trip, ev.forPerson);
      const notes = h('textarea', { value: ev.notes, placeholder: 'valgfritt' });

      body.append(
        field('Tittel', title),
        h('div', { class: 'check' }, allDay, h('label', { for: allDay.id, text: 'Hele dagen' })),
        startBox, endBox,
        field('Sted', location),
        h('div', { class: 'check' }, hard, h('label', { for: hard.id, text: 'Hard frist — dette kan bommes' })),
        field('Varsel i kalender', lead),
        field('For hvem', person),
        field('Notat', notes)
      );

      if (ev.source === 'analysis' && ev.reason) {
        body.appendChild(h('p', { class: 'reason', text: ev.reason }));
      }

      const save = () => {
        if (!title.value.trim()) { toast('Hendelsen trenger en tittel', true); return; }
        ev.title = title.value.trim();
        ev.allDay = allDay.checked;
        ev.start = startBox.querySelector('input').value;
        ev.end = endBox.querySelector('input').value;
        ev.location = location.value.trim();
        ev.hard = hard.checked;
        ev.leadMinutes = lead.value ? Number(lead.value) : null;
        ev.forPerson = valueOf(person).trim();
        ev.notes = notes.value;
        if (isNew) trip.events.push(ev);
        commit('trips');
        close();
        if (onDone) onDone(ev);
      };

      const extras = [];
      if (!isNew) {
        extras.push(h('div', { class: 'btn-row', style: 'margin-top:14px' },
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: () => {
              if (!ev.start) { toast('Trenger en tid for å eksportere', true); return; }
              downloadICS(`${slugify(ev.title)}.ics`, icsForEvent(ev, trip.name));
              toast('Kalenderfil lastet ned');
            }
          }, svg(ICON.cal, 16), ' Til kalender'),
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: async () => {
              if (await confirmSheet({ title: 'Slett hendelsen?', text: ev.title, confirmLabel: 'Slett', danger: true })) {
                trip.events = trip.events.filter((x) => x.id !== ev.id);
                commit('trips'); close(); toast('Slettet');
                if (onDone) onDone(null);
              }
            }
          }, svg(ICON.trash, 16), ' Slett')));
      }
      /* Secondary actions above; the footer must stay last because it is the
         sticky bar pinned to the bottom of the sheet. */
      extras.forEach((x) => body.appendChild(x));
      body.appendChild(footer(save, close));
      setTimeout(() => { if (isNew) title.focus(); }, 60);
    }
  });
}

/* ---------- entry ---------- */

export function editEntry(trip, list, existing, onDone) {
  const en = existing || newEntry({ source: 'manual' });
  const isNew = !existing;

  openSheet({
    title: isNew ? 'Ny linje' : 'Rediger linje',
    build: (body, close, rerender) => {
      const text = h('input', { type: 'text', value: en.text, placeholder: 'Hva?', enterkeyhint: 'next' });
      const qty = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: en.qty ?? '', placeholder: 'valgfritt' });
      const person = personInput(trip, en.forPerson);
      const dated = h('input', { type: 'checkbox', id: 'dt_' + en.id, checked: !!en.due });
      const dueBox = h('div', { class: 'field' });

      const renderDue = () => {
        if (!dated.checked) { dueBox.replaceChildren(); return; }
        const input = h('input', { type: hasTime(en.due) || !en.due ? 'datetime-local' : 'date', value: en.due });
        dueBox.replaceChildren(h('label', { text: 'Frist' }), input,
          h('p', { class: 'sub', text: 'En linje med frist vises også på tidslinjen.' }));
      };
      dated.addEventListener('change', renderDue);
      renderDue();

      const lead = leadSelect(en.leadMinutes);

      const index = depIndex(trip);
      const depBox = h('div', { class: 'chips' });
      const renderDeps = () => {
        depBox.replaceChildren(
          ...en.dependsOn.map((id) => {
            const t = index.get(id);
            return h('button', {
              type: 'button', class: 'chip on', onClick: () => { en.dependsOn = en.dependsOn.filter((x) => x !== id); renderDeps(); }
            }, svg(ICON.link, 14), t ? t.label : 'ukjent', ' ✕');
          }),
          h('button', {
            type: 'button', class: 'chip', onClick: () => pickDependency(trip, en, () => renderDeps())
          }, svg(ICON.plus, 14), 'Legg til')
        );
      };
      renderDeps();

      body.append(
        field('Tekst', text),
        h('div', { class: 'field-2' },
          field('Antall', qty),
          field('For hvem', person)),
        h('div', { class: 'check' }, dated, h('label', { for: dated.id, text: 'Har en frist' })),
        dueBox,
        field('Varsel i kalender', lead),
        field('Venter på', depBox, 'Kan ikke hukes av før dette er gjort.')
      );

      if (en.reason) body.appendChild(h('p', { class: 'reason', text: en.reason }));

      const save = () => {
        if (!text.value.trim()) { toast('Linjen trenger tekst', true); return; }
        en.text = text.value.trim();
        en.qty = qty.value ? Number(qty.value) : null;
        en.forPerson = valueOf(person).trim();
        en.due = dated.checked ? (dueBox.querySelector('input')?.value || '') : '';
        if (!en.due) en.derived = false;
        en.leadMinutes = lead.value ? Number(lead.value) : null;
        if (isNew) list.entries.push(en);
        commit('trips');
        close();
        if (onDone) onDone(en);
      };

      if (!isNew) {
        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:14px' },
          en.due ? h('button', {
            type: 'button', class: 'btn quiet sm', onClick: () => {
              downloadICS(`${slugify(en.text)}.ics`, icsForEntry(en, list, trip.name));
              toast('Kalenderfil lastet ned');
            }
          }, svg(ICON.cal, 16), ' Til kalender') : null,
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: async () => {
              if (await confirmSheet({ title: 'Slett linjen?', text: en.text, confirmLabel: 'Slett', danger: true })) {
                list.entries = list.entries.filter((x) => x.id !== en.id);
                commit('trips'); close(); toast('Slettet');
                if (onDone) onDone(null);
              }
            }
          }, svg(ICON.trash, 16), ' Slett')));
      }
      body.appendChild(footer(save, close));
      setTimeout(() => { if (isNew) text.focus(); }, 60);
    }
  });
}

function pickDependency(trip, entry, onDone) {
  const candidates = [];
  trip.events.forEach((ev) => candidates.push({ id: ev.id, label: ev.title, sub: ev.start || 'uten tid', done: ev.done }));
  trip.lists.forEach((l) => l.entries.forEach((en) => {
    if (en.id === entry.id) return;
    candidates.push({ id: en.id, label: en.text, sub: l.title, done: en.done });
  }));

  openSheet({
    title: 'Venter på hva?',
    build: (body, close) => {
      if (!candidates.length) { body.appendChild(h('p', { class: 'sub', text: 'Ingenting annet å knytte til ennå.' })); return; }
      const card = h('div', { class: 'card' });
      candidates.forEach((c) => {
        const on = entry.dependsOn.includes(c.id);
        card.appendChild(h('button', {
          type: 'button', class: 'row', onClick: () => {
            entry.dependsOn = on ? entry.dependsOn.filter((x) => x !== c.id) : entry.dependsOn.concat(c.id);
            commit('trips'); close(); if (onDone) onDone();
          }
        },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: c.label }),
          h('div', { class: 'row-sub', text: c.sub + (c.done ? ' · ferdig' : '') })),
        on ? svg(ICON.check, 18) : null));
      });
      body.appendChild(card);
    }
  });
}

/* ---------- list ---------- */

export function editList(trip, existing, onDone) {
  const list = existing || newList({});
  const isNew = !existing;

  openSheet({
    title: isNew ? 'Ny liste' : 'Rediger liste',
    build: (body, close) => {
      const title = h('input', { type: 'text', value: list.title === 'Liste' && isNew ? '' : list.title, placeholder: 'Navn på listen' });
      const kind = h('select', {}, ...LIST_KINDS.map((k) => h('option', { value: k.id, text: k.label, selected: list.kind === k.id })));
      const hint = h('input', { type: 'text', value: list.groupHint, placeholder: 'f.eks. Til barna' });

      body.append(
        field('Tittel', title),
        field('Type', kind),
        field('Overskrift', hint, 'Grupperer listen sammen med andre lister under samme overskrift.')
      );

      const save = () => {
        if (!title.value.trim()) { toast('Listen trenger et navn', true); return; }
        list.title = title.value.trim();
        list.kind = kind.value;
        list.groupHint = hint.value.trim();
        if (isNew) trip.lists.push(list);
        commit('trips');
        close();
        if (onDone) onDone(list);
      };
      if (!isNew) {
        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:14px' },
          h('button', {
            type: 'button', class: 'btn quiet sm', text: list.archived ? 'Hent fram igjen' : 'Arkiver listen',
            onClick: () => { list.archived = !list.archived; commit('trips'); close(); if (onDone) onDone(list); }
          }),
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: async () => {
              if (await confirmSheet({
                title: 'Slett listen?',
                text: `${list.title} — ${list.entries.length} linjer forsvinner også.`,
                confirmLabel: 'Slett', danger: true
              })) {
                trip.lists = trip.lists.filter((x) => x.id !== list.id);
                commit('trips'); close(); toast('Slettet'); if (onDone) onDone(null);
              }
            }
          }, svg(ICON.trash, 16), ' Slett')));
      }
      body.appendChild(footer(save, close));
      setTimeout(() => { if (isNew) title.focus(); }, 60);
    }
  });
}

/* ---------- vault ---------- */

export function editVault(trip, existing, onDone, presetKind) {
  const v = existing || newVault({ kind: presetKind || 'field', category: presetKind === 'note' ? 'note' : 'other' });
  const isNew = !existing;

  openSheet({
    title: isNew ? (v.kind === 'note' ? 'Nytt notat' : 'Nytt oppslag') : 'Rediger',
    build: (body, close, rerender) => {
      const kind = h('select', {},
        h('option', { value: 'field', text: 'Verdi — kopieres med ett trykk', selected: v.kind === 'field' }),
        h('option', { value: 'note', text: 'Notat — tittel og tekst', selected: v.kind === 'note' }));
      kind.addEventListener('change', () => { v.kind = kind.value; if (v.kind === 'note') v.category = 'note'; rerender(); });

      const label = h('input', { type: 'text', value: v.label, placeholder: v.kind === 'note' ? 'Tittel' : 'f.eks. Passnummer' });
      const value = v.kind === 'note'
        ? h('textarea', { value: v.value, placeholder: 'Tekst' })
        : h('input', { type: 'text', value: v.value, placeholder: 'Verdien' });
      const category = h('select', {}, ...VAULT_CATEGORIES.map((c) => h('option', { value: c.id, text: c.label, selected: v.category === c.id })));
      const expires = h('input', { type: 'date', value: (v.expires || '').slice(0, 10) });
      const note = h('input', { type: 'text', value: v.note, placeholder: 'valgfritt' });

      body.append(
        field('Type', kind),
        field(v.kind === 'note' ? 'Tittel' : 'Navn', label),
        field(v.kind === 'note' ? 'Tekst' : 'Verdi', value),
        field('Kategori', category),
        field('Utløper', expires, 'Sett for pass, forsikring og annet med gyldighetsdato.'),
        field('Kommentar', note)
      );

      const save = () => {
        if (!label.value.trim()) { toast('Trenger et navn', true); return; }
        v.kind = kind.value;
        v.label = label.value.trim();
        v.value = value.value;
        v.category = category.value;
        v.expires = expires.value;
        v.note = note.value.trim();
        if (isNew) trip.vault.push(v);
        commit('trips');
        close();
        if (onDone) onDone(v);
      };
      if (!isNew) {
        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:14px' },
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: async () => {
              if (await confirmSheet({ title: 'Slett?', text: v.label, confirmLabel: 'Slett', danger: true })) {
                trip.vault = trip.vault.filter((x) => x.id !== v.id);
                commit('trips'); close(); toast('Slettet'); if (onDone) onDone(null);
              }
            }
          }, svg(ICON.trash, 16), ' Slett')));
      }
      body.appendChild(footer(save, close));
      setTimeout(() => { if (isNew) label.focus(); }, 60);
    }
  });
}

/* ---------- trip ---------- */

export function editTrip(existing, onDone) {
  const isNew = !existing;
  const draft = existing || { name: '', kind: '', start: '', end: '' };

  openSheet({
    title: isNew ? 'Ny tur' : 'Rediger turen',
    build: (body, close) => {
      const name = h('input', { type: 'text', value: draft.name, placeholder: 'Navn — kan endres senere' });
      const kind = h('input', { type: 'text', value: draft.kind, placeholder: 'hytte, cruise, kveld, tur …', list: 'kinds' });
      const kinds = h('datalist', { id: 'kinds' },
        ...['hytte', 'cruise', 'kveld', 'hiking', 'by', 'strand', 'fly', 'bil', 'besøk'].map((k) => h('option', { value: k })));
      const start = h('input', { type: 'date', value: (draft.start || '').slice(0, 10) });
      const end = h('input', { type: 'date', value: (draft.end || '').slice(0, 10) });

      body.append(
        field('Navn', name),
        field('Type', h('div', {}, kind, kinds), 'Driver gjenkjenning av pakkegrupper senere. Verdt å fylle ut.'),
        h('div', { class: 'field-2' }, field('Fra', start), field('Til', end)),
        h('p', { class: 'sub', text: 'Datoer er valgfrie. En kveldstur har ingen.' })
      );

      const save = () => {
        const patch = {
          name: name.value.trim() || 'Ny tur',
          kind: kind.value.trim(),
          start: start.value,
          end: end.value
        };
        if (isNew) {
          const trip = addTrip(patch);
          close();
          if (onDone) onDone(trip);
        } else {
          Object.assign(existing, patch);
          commit('trips');
          close();
          if (onDone) onDone(existing);
        }
      };
      if (!isNew) {
        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:14px' },
          h('button', {
            type: 'button', class: 'btn quiet sm', text: existing.archivedAt ? 'Hent fram igjen' : 'Arkiver turen',
            onClick: () => {
              const archiving = !existing.archivedAt;
              archiveTrip(existing.id, archiving);
              close();
              if (onDone) onDone(existing, archiving ? 'archived' : 'unarchived');
            }
          }),
          h('button', {
            type: 'button', class: 'btn quiet sm', onClick: async () => {
              if (await confirmSheet({
                title: 'Slett turen?',
                text: `${existing.name} — alt innhold forsvinner. Dette kan ikke angres.`,
                confirmLabel: 'Slett alt', danger: true
              })) { deleteTrip(existing.id); close(); toast('Turen er slettet'); if (onDone) onDone(null); }
            }
          }, svg(ICON.trash, 16), ' Slett')));
      }
      body.appendChild(footer(save, close));
      setTimeout(() => { if (isNew) name.focus(); }, 60);
    }
  });
}

/* ---------- people ---------- */

export function editPeople(trip, onDone) {
  openSheet({
    title: 'Folk på turen',
    build: (body, close, rerender) => {
      body.appendChild(h('p', { class: 'sub', text: 'Bare navn — brukes til å merke linjer og hendelser.' }));
      const card = h('div', { class: 'card' });
      if (!trip.people.length) card.appendChild(h('div', { class: 'card-body' }, h('p', { class: 'sub', style: 'margin:0', text: 'Ingen lagt inn. Ikke nødvendig for å bruke appen.' })));
      trip.people.forEach((p) => {
        card.appendChild(h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: p.name })),
          iconBtn('trash', 'Fjern ' + p.name, () => {
            trip.people = trip.people.filter((x) => x.id !== p.id);
            commit('trips'); rerender(); if (onDone) onDone();
          })));
      });
      const input = h('input', { type: 'text', placeholder: 'Nytt navn', enterkeyhint: 'done' });
      const add = () => {
        const name = input.value.trim();
        if (!name) return;
        trip.people.push({ id: uid('p'), name });
        commit('trips'); input.value = ''; rerender(); if (onDone) onDone();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      body.append(card, h('div', { class: 'field' }, input),
        h('button', { type: 'button', class: 'btn wide', text: 'Legg til', onClick: add }));
    }
  });
}
