/* Packing groups — the learning feature. Groups are global, never belong to a
   trip, and are created two ways only: explicitly in this editor, or offered
   after a trip. Nothing here mutates a group silently. */

import { h, svg, ICON, iconBtn, toast, openSheet, confirmSheet, promptSheet } from '../dom.js';
import { state, saveLibrary } from '../store.js';
import { newGroup, normText } from '../model.js';

export function openGroupEditor() {
  openSheet({
    title: 'Pakkegrupper',
    full: true,
    build: (body, close, rerender) => {
      body.appendChild(h('p', { class: 'sub', text: 'Gruppene er dine, ikke appens. De gjelder på tvers av alle turer, og de er det appen husker.' }));

      if (!state.library.groups.length) {
        body.appendChild(h('div', { class: 'empty' },
          h('strong', { text: 'Ingen grupper ennå' }),
          h('p', { text: 'En gruppe er en liste du gjenbruker — «fly», «hytte», «strand». Neste gang du pakker to av tingene, foreslår appen resten.' })));
      }

      state.library.groups
        .slice()
        .sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name, 'nb'))
        .forEach((g) => {
          const card = h('div', { class: 'card' },
            h('div', { class: 'card-head' },
              h('h2', { text: g.name }),
              h('span', { class: 'count', text: `${g.members.length} ting · brukt ${g.usedCount}×` }),
              iconBtn('pencil', 'Rediger ' + g.name, () => openOneGroup(g, rerender))));
          card.appendChild(h('div', { class: 'card-body' },
            h('p', { class: 'sub', style: 'margin:0', text: g.members.map((m) => m.text + (m.qty ? ` ×${m.qty}` : '')).join(' · ') || 'tom' })));
          body.appendChild(card);
        });

      body.appendChild(h('button', {
        type: 'button', class: 'btn wide', style: 'margin-top:10px', onClick: async () => {
          const name = await promptSheet({ title: 'Ny gruppe', label: 'Navn', placeholder: 'fly, hytte, strand …' });
          if (!name) return;
          state.library.groups.push(newGroup({ name }));
          saveLibrary();
          rerender();
        }
      }, svg(ICON.plus, 18), ' Ny gruppe'));

      const never = state.library.neverSuggest;
      if (never.length) {
        const card = h('div', { class: 'card', style: 'margin-top:18px' },
          h('div', { class: 'card-head' },
            h('h2', { text: 'Aldri foreslå' }),
            h('span', { class: 'count', text: String(never.length) })));
        card.appendChild(h('div', { class: 'card-body' },
          h('p', { class: 'sub', style: 'margin:0 0 10px', text: 'Avvist to ganger, og derfor slutt foreslått — på alle turer.' }),
          h('div', { class: 'chips' }, ...never.map((n) => h('button', {
            type: 'button', class: 'chip', onClick: () => {
              state.library.neverSuggest = state.library.neverSuggest.filter((x) => x !== n);
              delete state.library.dismissCounts[n];
              saveLibrary();
              rerender();
              toast('Kan foreslås igjen');
            }
          }, n, ' ✕')))));
        body.appendChild(card);
      }
    }
  });
}

function openOneGroup(group, onDone) {
  openSheet({
    title: group.name,
    build: (body, close, rerender) => {
      const card = h('div', { class: 'card' });
      if (!group.members.length) {
        card.appendChild(h('div', { class: 'card-body' }, h('p', { class: 'sub', style: 'margin:0', text: 'Ingen ting i gruppen ennå.' })));
      }
      group.members.forEach((m, i) => {
        card.appendChild(h('div', { class: 'row' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: m.text }),
            (m.qty || m.forPerson) ? h('div', { class: 'row-sub' },
              m.qty ? h('span', { class: 'tag', text: '×' + m.qty }) : null,
              m.forPerson ? h('span', { class: 'tag person', text: m.forPerson }) : null) : null),
          iconBtn('pencil', 'Rediger ' + m.text, () => editMember(group, i, () => { rerender(); if (onDone) onDone(); })),
          iconBtn('trash', 'Fjern ' + m.text, () => {
            group.members.splice(i, 1);
            group.updatedAt = new Date().toISOString();
            saveLibrary();
            rerender();
            if (onDone) onDone();
          })));
      });
      body.appendChild(card);

      const input = h('input', { type: 'text', placeholder: 'Legg til ting', enterkeyhint: 'enter' });
      const add = () => {
        const text = input.value.trim();
        if (!text) return;
        group.members.push({ text, qty: null, forPerson: '' });
        group.updatedAt = new Date().toISOString();
        saveLibrary();
        input.value = '';
        rerender();
        setTimeout(() => { const again = body.querySelector('.field input'); if (again) again.focus(); }, 20);
        if (onDone) onDone();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      body.append(h('div', { class: 'field' }, input),
        h('button', { type: 'button', class: 'btn wide', text: 'Legg til', onClick: add }));

      body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:18px' },
        h('button', {
          type: 'button', class: 'btn quiet sm', text: 'Gi nytt navn', onClick: async () => {
            const name = await promptSheet({ title: 'Nytt navn', label: 'Navn', value: group.name });
            if (!name) return;
            group.name = name;
            group.updatedAt = new Date().toISOString();
            saveLibrary();
            close();
            if (onDone) onDone();
          }
        }),
        h('button', {
          type: 'button', class: 'btn quiet sm', onClick: async () => {
            if (await confirmSheet({ title: 'Slett gruppen?', text: `${group.name} — ${group.members.length} ting. Turene beholder det som alt er pakket.`, confirmLabel: 'Slett', danger: true })) {
              state.library.groups = state.library.groups.filter((g) => g.id !== group.id);
              saveLibrary();
              close();
              if (onDone) onDone();
              toast('Gruppen er slettet');
            }
          }
        }, svg(ICON.trash, 16), ' Slett gruppen')));
    }
  });
}

function editMember(group, index, onDone) {
  const m = group.members[index];
  openSheet({
    title: 'Rediger',
    build: (body, close) => {
      const text = h('input', { type: 'text', value: m.text });
      const qty = h('input', { type: 'number', min: '1', value: m.qty ?? '' });
      const person = h('input', { type: 'text', value: m.forPerson });
      body.append(
        h('div', { class: 'field' }, h('label', { text: 'Ting' }), text),
        h('div', { class: 'field-2' },
          h('div', { class: 'field' }, h('label', { text: 'Antall' }), qty),
          h('div', { class: 'field' }, h('label', { text: 'For hvem' }), person)),
        h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
          h('button', {
            type: 'button', class: 'btn', text: 'Lagre', onClick: () => {
              m.text = text.value.trim() || m.text;
              m.qty = qty.value ? Number(qty.value) : null;
              m.forPerson = person.value.trim();
              group.updatedAt = new Date().toISOString();
              saveLibrary();
              close();
              if (onDone) onDone();
            }
          })));
    }
  });
}

/* ---------- offered after a trip ---------- */

/* "Save these 9 packed items as a group?" — he names it. Never silent. */
export function offerSaveGroup(trip, onDone) {
  const packed = [];
  trip.lists.forEach((l) => {
    if (l.kind !== 'packing') return;
    l.entries.forEach((e) => { if (e.done) packed.push(e); });
  });

  if (packed.length < 3) { if (onDone) onDone(); return false; }

  openSheet({
    title: 'Lagre som gruppe?',
    onClose: () => { if (onDone) onDone(); },
    build: (body, close) => {
      const chosen = new Set(packed.map((e) => e.id));
      const name = h('input', { type: 'text', placeholder: 'fly, hytte, strand …' });

      body.append(
        h('p', { class: 'sub', text: `Du pakket ${packed.length} ting på denne turen. Lagre dem som en gruppe, så foreslår appen resten neste gang du pakker noen av dem.` }),
        h('div', { class: 'field' }, h('label', { text: 'Navn på gruppen' }), name));

      const card = h('div', { class: 'card' });
      packed.forEach((e) => {
        const rowSel = () => chosen.has(e.id);
        const btn = h('button', {
          type: 'button', class: 'sel-row', style: 'width:100%;background:none;border:0;border-top:1px solid var(--line-soft)',
          onClick: () => {
            if (rowSel()) chosen.delete(e.id); else chosen.add(e.id);
            btn.className = 'sel-row' + (rowSel() ? '' : ' off');
            tick.setAttribute('aria-pressed', String(rowSel()));
          }
        });
        const tick = h('button', { type: 'button', class: 'tick', 'aria-pressed': 'true', tabindex: '-1' }, svg(ICON.check, 17));
        btn.append(tick, h('div', { class: 'sel-body' },
          h('div', { class: 'row-title', text: e.text }),
          e.forPerson ? h('div', { class: 'row-sub' }, h('span', { class: 'tag person', text: e.forPerson })) : null));
        card.appendChild(btn);
      });
      body.appendChild(card);

      body.appendChild(h('div', { class: 'form-foot' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Ikke nå', onClick: () => close() }),
        h('button', {
          type: 'button', class: 'btn', text: 'Lagre gruppen', onClick: () => {
            const groupName = name.value.trim();
            if (!groupName) { toast('Gruppen trenger et navn', true); return; }
            const members = packed.filter((e) => chosen.has(e.id)).map((e) => ({ text: e.text, qty: e.qty, forPerson: e.forPerson }));
            if (!members.length) { toast('Velg minst én ting', true); return; }
            const existing = state.library.groups.find((g) => normText(g.name) === normText(groupName));
            if (existing) {
              members.forEach((m) => {
                if (!existing.members.some((x) => normText(x.text) === normText(m.text))) existing.members.push(m);
              });
              existing.updatedAt = new Date().toISOString();
              toast(`Lagt til i «${existing.name}»`);
            } else {
              state.library.groups.push(newGroup({ name: groupName, members }));
              toast(`Gruppen «${groupName}» er lagret`);
            }
            saveLibrary();
            close();
            if (onDone) onDone();
          }
        })));
      setTimeout(() => name.focus(), 60);
    }
  });
  return true;
}
