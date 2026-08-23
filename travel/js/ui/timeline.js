/* Timeline — events plus the entries that have a due, grouped by day.
   Undated things are deliberately not here; they live in Lists. */

import { h, svg, ICON, iconBtn, toast } from '../dom.js';
import { commit } from '../store.js';
import {
  timelineItems, groupByDay, nextItem, depIndex, blockersOf, formatTime,
  countdown, countUndated
} from '../derive.js';
import { editEvent, editEntry } from './editors.js';
import { icsForTrip, downloadICS, slugify } from '../ics.js';

function tags(item, index) {
  const out = [];
  const o = item.obj;
  if (item.type === 'event' && o.hard) out.push(h('span', { class: 'tag hard', text: 'hard frist' }));
  if (o.derived) out.push(h('span', { class: 'tag derived', text: 'utledet tid' }));
  if (item.type === 'entry') {
    out.push(h('span', { class: 'tag', text: item.list.title }));
    const blockers = blockersOf(o, index);
    if (blockers.length) out.push(h('span', { class: 'tag dep', text: 'venter på ' + blockers[0].label }));
  }
  if (o.forPerson) out.push(h('span', { class: 'tag person', text: o.forPerson }));
  if (item.type === 'event' && o.location) out.push(h('span', { class: 'tag', text: o.location }));
  return out;
}

function row(trip, item, index, rerender) {
  const o = item.obj;
  const blocked = item.type === 'entry' && blockersOf(o, index).length > 0;

  const tick = h('button', {
    type: 'button', class: 'tick', 'aria-pressed': String(!!o.done),
    'aria-label': (o.done ? 'Angre' : 'Merk ferdig') + ': ' + item.title,
    disabled: blocked && !o.done,
    onClick: (e) => {
      e.stopPropagation();
      if (blocked && !o.done) { toast('Venter på ' + blockersOf(o, index)[0].label, true); return; }
      o.done = !o.done;
      commit('trips');
      rerender();
    }
  }, svg(ICON.check, 17));

  const meta = tags(item, index);

  return h('div', {
    class: 'row' + (o.done ? ' done' : '') + (blocked ? ' blocked' : ''),
    dataset: { key: item.key }
  },
  h('div', { class: 'row-time', text: item.allDay ? '—' : formatTime(item.when) }),
  h('button', { type: 'button', class: 'tick-hit', 'aria-hidden': 'false', onClick: (e) => { e.stopPropagation(); tick.click(); } }, tick),
  h('button', {
    type: 'button', class: 'row-main', style: 'background:none;border:0;padding:0;text-align:left;color:inherit',
    onClick: () => {
      if (item.type === 'event') editEvent(trip, o, rerender);
      else editEntry(trip, item.list, o, rerender);
    }
  },
  h('div', { class: 'row-title', text: item.title }),
  meta.length ? h('div', { class: 'row-sub' }, ...meta) : null,
  (o.reason && (o.derived || o.source === 'analysis')) ? h('div', { class: 'reason', text: o.reason }) : null),
  svg(ICON.chevron, 15));
}

export function renderTimeline(main, trip, ctx) {
  const now = new Date();
  const items = timelineItems(trip);
  const index = depIndex(trip);
  const next = nextItem(items, now);
  const rerender = ctx.rerender;

  main.appendChild(h('div', { class: 'screen-head' },
    h('h1', { text: 'Tidslinje' }),
    iconBtn('search', 'Søk i turen', () => ctx.openSearch()),
    iconBtn('cal', 'Eksporter turen til kalender', () => {
      const { ics, count } = icsForTrip(trip);
      if (!count) { toast('Ingenting med tid å eksportere ennå', true); return; }
      downloadICS(`${slugify(trip.name)}.ics`, ics);
      toast(`${count} oppføringer lastet ned`);
    }),
    iconBtn('plus', 'Ny hendelse', () => editEvent(trip, null, rerender))
  ));

  if (!items.length) {
    const undated = countUndated(trip);
    main.appendChild(h('div', { class: 'empty' },
      h('strong', { text: 'Ingenting med tid ennå' }),
      h('p', {
        text: undated
          ? `Du har ${undated} ting uten dato i listene. Gi dem en frist, så havner de her.`
          : 'Skriv det du har i hodet i Fang opp, eller legg inn en hendelse manuelt.'
      }),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('button', { type: 'button', class: 'btn', text: 'Fang opp', onClick: () => ctx.go('capture') }),
        h('button', { type: 'button', class: 'btn ghost', text: 'Ny hendelse', onClick: () => editEvent(trip, null, rerender) }))));
    return;
  }

  /* The next thing is pinned at the top, so it is there whatever the scroll. */
  if (next) {
    const card = h('div', { class: 'card pinned' },
      h('span', { class: 'pin-label', text: `Neste — ${next.allDay ? 'i dag/uten tid' : countdown(next.when - now)}` }),
      row(trip, next, index, rerender));
    main.appendChild(card);
  }

  const days = groupByDay(items, now);
  days.forEach((day) => {
    const doneCount = day.items.filter((i) => i.done).length;
    main.appendChild(h('div', { class: 'day-head' + (day.isToday ? ' today' : '') },
      day.label,
      h('span', { text: `${day.items.length - doneCount} åpne av ${day.items.length}` })));

    const card = h('div', { class: 'card' });
    let markerPlaced = !day.isToday;
    day.items.forEach((item) => {
      if (!markerPlaced && item.when >= now) {
        card.appendChild(h('div', { class: 'now-marker', dataset: { now: '1' } }, h('span', { text: 'nå' })));
        markerPlaced = true;
      }
      card.appendChild(row(trip, item, index, rerender));
    });
    if (!markerPlaced) card.appendChild(h('div', { class: 'now-marker', dataset: { now: '1' } }, h('span', { text: 'nå' })));
    main.appendChild(card);
  });

  const undated = countUndated(trip);
  if (undated) {
    main.appendChild(h('button', {
      type: 'button', class: 'btn quiet wide', style: 'margin-top:14px',
      text: `${undated} ting uten dato — i Lister`,
      onClick: () => ctx.go('lists')
    }));
  }

  /* Auto-scroll to now, unless the user asked to focus something specific. */
  ctx.afterRender(() => {
    const target = ctx.focus
      ? main.querySelector(`[data-key="${CSS.escape(ctx.focus)}"]`)
      : (main.querySelector('[data-now="1"]') || (next && main.querySelector(`[data-key="${CSS.escape(next.key)}"]`)));
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
      if (ctx.focus) {
        target.style.transition = 'background .5s';
        target.style.background = 'color-mix(in srgb, var(--accent) 18%, transparent)';
        setTimeout(() => { target.style.background = ''; }, 900);
      }
    }
  });
}
