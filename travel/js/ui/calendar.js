/* Calendar export — the whole timeline as one .ics file.

   Calendar is the only reminder path that works with the app closed, so this is
   the sheet that gets a plan out of the app and into the phone. Nothing is sent
   anywhere: the file is built here and handed to the browser. */

import { h, svg, ICON, toast, openSheet } from '../dom.js';
import { exportSelection, icsForTrip, downloadICS, slugify } from '../ics.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* Same box as the forms use, on a row wide enough to hit with a thumb. */
function checkRow(id, label, sub, checked, onChange) {
  const box = h('input', {
    type: 'checkbox', id, checked,
    style: 'flex:none;width:22px;height:22px;margin-top:1px;accent-color:var(--accent)'
  });
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', { class: 'sel-row', style: 'align-items:flex-start;min-height:var(--tap)' },
    box,
    h('label', { class: 'sel-body', for: id },
      h('div', { class: 'row-title', text: label }),
      sub ? h('div', { class: 'row-sub', text: sub }) : null));
}

export function openCalendarExport(trip) {
  /* Done things in a calendar are noise; everything else is in by default, so
     "the timeline" means the timeline. */
  const opts = { events: true, entries: true, includeDone: false, fromNow: false };

  openSheet({
    title: 'Til kalender',
    build: (body, close, rerender) => {
      const all = exportSelection(trip, { events: true, entries: true, includeDone: true, fromNow: false });
      const picked = exportSelection(trip, opts);

      body.appendChild(h('p', { class: 'sub', text: 'Lager én .ics-fil av tidslinjen. Åpne den på telefonen og legg alt inn i kalenderen i ett trykk.' }));

      if (!all.total) {
        body.append(
          h('div', { class: 'empty' },
            h('strong', { text: 'Ingenting med tid ennå' }),
            h('p', { text: 'Bare hendelser og linjer med frist kan bli kalenderoppføringer. Ting uten dato blir liggende i Lister.' })),
          h('div', { class: 'form-foot' },
            h('button', { type: 'button', class: 'btn ghost', text: 'Lukk', onClick: () => close() })));
        return;
      }

      /* How many of the trip's dated things are ticked off — the number the
         "ta med ferdige" box decides the fate of. */
      const doneCount = all.total - exportSelection(trip, { events: true, entries: true, includeDone: false, fromNow: false }).total;
      const card = h('div', { class: 'card' });
      card.append(
        checkRow('cx_ev', 'Hendelser', plural(all.events.length, 'hendelse', 'hendelser') + ' på tidslinjen', opts.events,
          (v) => { opts.events = v; rerender(); }),
        checkRow('cx_en', 'Linjer med frist', plural(all.entries.length, 'linje', 'linjer') + ' fra listene', opts.entries,
          (v) => { opts.entries = v; rerender(); }),
        checkRow('cx_done', 'Ta med ferdige', doneCount ? `${doneCount} er huket av` : 'ingenting er huket av ennå', opts.includeDone,
          (v) => { opts.includeDone = v; rerender(); }),
        checkRow('cx_now', 'Bare fra i dag og fremover', 'hopper over det som allerede har vært', opts.fromNow,
          (v) => { opts.fromNow = v; rerender(); }));
      body.appendChild(card);

      body.appendChild(h('p', { class: 'notice', style: 'margin-top:12px' },
        picked.total
          ? `${plural(picked.total, 'oppføring', 'oppføringer')} blir med i filen.`
          : 'Ingenting er valgt — filen ville blitt tom.'));

      body.appendChild(h('p', { class: 'sub', text: 'Varsler du har satt på en hendelse blir med som påminnelse. Filen er et øyeblikksbilde: endrer du planen her, eksporter på nytt — de fleste kalendere kjenner igjen oppføringene og oppdaterer dem i stedet for å lage duplikater.' }));

      body.appendChild(h('div', { class: 'form-foot' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
        h('button', {
          type: 'button', class: 'btn', disabled: picked.total === 0,
          onClick: () => {
            const { ics, count } = icsForTrip(trip, opts);
            if (!count) { toast('Ingenting å eksportere', true); return; }
            downloadICS(`${slugify(trip.name)}.ics`, ics);
            close();
            toast(`${plural(count, 'oppføring', 'oppføringer')} lastet ned`);
          }
        }, svg(ICON.cal, 18), ' Last ned .ics')));
    }
  });
}
