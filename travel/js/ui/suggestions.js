/* Pending suggestions — the gap proposals left undecided at review time.
   Accepting or dismissing here behaves exactly as it does in review. */

import { h, svg, ICON, toast } from '../dom.js';
import { commit, bumpDismiss, addNeverSuggest } from '../store.js';
import { newEntry, newList, normText } from '../model.js';
import { pendingSuggestions } from '../derive.js';
import { DISMISS_LIMIT } from '../config.js';

function targetPackingList(trip) {
  let list = trip.lists.find((l) => !l.archived && l.kind === 'packing');
  if (!list) { list = newList({ kind: 'packing', title: 'Pakkeliste' }); trip.lists.push(list); }
  return list;
}

export function renderSuggestions(main, trip, ctx) {
  const rerender = ctx.rerender;
  const pending = pendingSuggestions(trip);

  main.appendChild(h('div', { class: 'screen-head' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tilbake', onClick: () => ctx.go('lists') }, svg(ICON.back, 20)),
    h('h1', { text: 'Forslag' })));

  if (!pending.length) {
    main.appendChild(h('div', { class: 'empty' },
      h('strong', { text: 'Ingen forslag' }),
      h('p', { text: 'Forslag dukker opp når et opptak matcher en pakkegruppe du har lagret.' })));
    return;
  }

  const byGroup = new Map();
  pending.forEach((s) => {
    const key = s.payload.groupName || 'Andre forslag';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(s);
  });

  byGroup.forEach((items, groupName) => {
    const card = h('div', { class: 'card gap-card' },
      h('div', { class: 'card-head' },
        h('h2', {}, 'Fra gruppen «', groupName, '»'),
        h('span', { class: 'count', text: String(items.length) })));

    items.forEach((s) => {
      card.appendChild(h('div', { class: 'sel-row' },
        h('div', { class: 'sel-body' },
          h('div', { class: 'row-title', text: s.payload.text || '(uten tekst)' }),
          h('div', { class: 'reason', text: s.reason })),
        h('button', {
          type: 'button', class: 'btn sm', text: 'Legg til', onClick: () => {
            const list = targetPackingList(trip);
            list.entries.push(newEntry({
              text: s.payload.text, qty: s.payload.qty ?? null, forPerson: s.payload.forPerson || '',
              groupId: s.groupId, source: 'group', reason: s.reason
            }));
            s.status = 'accepted';
            commit('trips');
            toast('Lagt til i ' + list.title);
            rerender();
          }
        }),
        h('button', {
          type: 'button', class: 'copy', 'aria-label': 'Avvis ' + s.payload.text, onClick: () => {
            s.status = 'dismissed';
            const n = bumpDismiss(normText(s.payload.text));
            if (n >= DISMISS_LIMIT) { addNeverSuggest(normText(s.payload.text)); toast('Foreslås aldri igjen'); }
            else toast('Avvist');
            commit('trips');
            rerender();
          }
        }, svg(ICON.close, 16))));
    });
    main.appendChild(card);
  });

  main.appendChild(h('p', { class: 'sub', style: 'text-align:center', text: `Avvist to ganger, og appen slutter å foreslå det — på alle turer.` }));
}
