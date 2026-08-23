/* Lists — every list for the trip, ticked in place, grouped by groupHint. */

import { h, svg, ICON, iconBtn, toast } from '../dom.js';
import { commit } from '../store.js';
import { newEntry } from '../model.js';
import { depIndex, blockersOf, listGroups, formatWhen, hasTime, parseLocal } from '../derive.js';
import { editList, editEntry, editPeople } from './editors.js';

function entryRow(trip, list, en, index, rerender) {
  const blockers = blockersOf(en, index);
  const blocked = blockers.length > 0;

  const tick = h('button', {
    type: 'button', class: 'tick', 'aria-pressed': String(!!en.done),
    'aria-label': (en.done ? 'Angre' : 'Merk ferdig') + ': ' + en.text,
    disabled: blocked && !en.done,
    onClick: (e) => {
      e.stopPropagation();
      if (blocked && !en.done) { toast('Venter på: ' + blockers.map((b) => b.label).join(', '), true); return; }
      en.done = !en.done;
      commit('trips');
      rerender();
    }
  }, svg(ICON.check, 17));

  const meta = [];
  if (en.qty) meta.push(h('span', { class: 'tag', text: '×' + en.qty }));
  if (en.forPerson) meta.push(h('span', { class: 'tag person', text: en.forPerson }));
  if (en.due) meta.push(h('span', { class: 'tag' + (en.derived ? ' derived' : ''), text: formatWhen(parseLocal(en.due), !hasTime(en.due)) }));
  if (en.derived && !en.due) meta.push(h('span', { class: 'tag derived', text: 'utledet' }));
  if (blocked) meta.push(h('span', { class: 'tag dep', text: 'venter på ' + blockers[0].label }));
  if (en.groupId) meta.push(h('span', { class: 'tag ai', text: 'fra gruppe' }));

  return h('div', {
    class: 'row' + (en.done ? ' done' : '') + (blocked ? ' blocked' : ''),
    dataset: { key: 'entry:' + en.id }
  },
  h('button', { type: 'button', class: 'tick-hit', onClick: (e) => { e.stopPropagation(); tick.click(); } }, tick),
  h('button', {
    type: 'button', class: 'row-main', style: 'background:none;border:0;padding:0;text-align:left;color:inherit',
    onClick: () => editEntry(trip, list, en, rerender)
  },
  h('div', { class: 'row-title', text: en.text }),
  meta.length ? h('div', { class: 'row-sub' }, ...meta) : null,
  (en.reason && (en.derived || en.source !== 'manual' || en.dependsOn.length)) ? h('div', { class: 'reason', text: en.reason }) : null),
  svg(ICON.chevron, 15));
}

function quickAdd(trip, list, rerender) {
  const input = h('input', {
    type: 'text', placeholder: 'Legg til linje', enterkeyhint: 'enter',
    dataset: { quick: list.id },
    style: 'flex:1 1 auto;min-height:38px;padding:0 10px;background:var(--bg);border:1px solid var(--line);border-radius:10px'
  });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    list.entries.push(newEntry({ text, source: 'manual' }));
    commit('trips');
    input.value = '';
    rerender();
    setTimeout(() => {
      const again = document.querySelector(`[data-quick="${list.id}"]`);
      if (again) again.focus();
    }, 20);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return h('div', { class: 'row', style: 'gap:8px;align-items:center' },
    input,
    h('button', { type: 'button', class: 'btn sm', text: 'Legg til', onClick: add }));
}

/* One card per list title. Each groupHint inside it becomes a heading row, so
   "one packing list with two headings" reads as exactly that. */
function groupCard(trip, group, index, rerender) {
  const card = h('div', { class: 'card', dataset: { key: 'list:' + group.lists[0].id } });

  card.appendChild(h('div', { class: 'card-head' },
    h('h2', { text: group.title }),
    h('span', { class: 'count', text: group.total ? `${group.done}/${group.total}` : 'tom' }),
    group.lists.length === 1
      ? iconBtn('pencil', 'Rediger ' + group.title, () => editList(trip, group.lists[0], rerender))
      : null));

  card.appendChild(h('div', { class: 'progress' }, h('i', { style: `width:${group.pct}%` })));

  group.lists.forEach((list) => {
    if (list.groupHint) {
      card.appendChild(h('div', { class: 'row', style: 'align-items:center;padding-top:12px' },
        h('div', {
          class: 'row-main', style: 'font-size:.76rem;font-weight:680;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)',
          text: list.groupHint
        }),
        h('span', { class: 'count', text: `${list.entries.filter((e) => e.done).length}/${list.entries.length}` }),
        iconBtn('pencil', 'Rediger ' + list.groupHint, () => editList(trip, list, rerender))));
    }

    const open = list.entries.filter((e) => !e.done);
    const done = list.entries.filter((e) => e.done);
    open.forEach((en) => card.appendChild(entryRow(trip, list, en, index, rerender)));

    if (done.length) {
      const wrap = h('div', {});
      const toggle = h('button', {
        type: 'button', class: 'row', onClick: () => {
          const showing = wrap.childElementCount > 0;
          if (showing) wrap.replaceChildren();
          else done.forEach((en) => wrap.appendChild(entryRow(trip, list, en, index, rerender)));
          toggle.querySelector('.row-title').textContent = (showing ? 'Vis' : 'Skjul') + ` ${done.length} ferdige`;
        }
      }, h('div', { class: 'row-main' }, h('div', { class: 'row-title', style: 'color:var(--muted);font-size:.85rem', text: `Vis ${done.length} ferdige` })));
      card.append(toggle, wrap);
    }

    card.appendChild(quickAdd(trip, list, rerender));
  });

  return card;
}

export function renderLists(main, trip, ctx) {
  const index = depIndex(trip);
  const rerender = ctx.rerender;

  main.appendChild(h('div', { class: 'screen-head' },
    h('h1', { text: 'Lister' }),
    iconBtn('search', 'Søk i turen', () => ctx.openSearch()),
    iconBtn('gear', 'Folk på turen', () => editPeople(trip, rerender)),
    iconBtn('plus', 'Ny liste', () => editList(trip, null, rerender))
  ));

  const groups = listGroups(trip);

  if (!groups.length) {
    main.appendChild(h('div', { class: 'empty' },
      h('strong', { text: 'Ingen lister ennå' }),
      h('p', { text: 'Dump inn det du skal huske i Fang opp — appen deler det i lister. Eller lag en tom liste selv.' }),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('button', { type: 'button', class: 'btn', text: 'Fang opp', onClick: () => ctx.go('capture') }),
        h('button', { type: 'button', class: 'btn ghost', text: 'Ny liste', onClick: () => editList(trip, null, rerender) }))));
    return;
  }

  groups.forEach((g) => main.appendChild(groupCard(trip, g, index, rerender)));

  const archived = trip.lists.filter((l) => l.archived);
  if (archived.length) {
    const box = h('div', {});
    main.appendChild(h('button', {
      type: 'button', class: 'btn quiet wide', style: 'margin-top:8px',
      text: `${archived.length} arkiverte lister`,
      onClick: () => {
        if (box.childElementCount) { box.replaceChildren(); return; }
        listGroups(trip, true).filter((g) => g.lists.some((l) => l.archived)).forEach((g) => {
          const only = g.lists.filter((l) => l.archived);
          const total = only.reduce((n, l) => n + l.entries.length, 0);
          const done = only.reduce((n, l) => n + l.entries.filter((e) => e.done).length, 0);
          box.appendChild(groupCard(trip, { ...g, lists: only, total, done, pct: total ? Math.round((done / total) * 100) : 0 }, index, rerender));
        });
      }
    }));
    main.appendChild(box);
  }

  ctx.afterRender(() => {
    if (!ctx.focus) return;
    const target = main.querySelector(`[data-key="${CSS.escape(ctx.focus)}"]`);
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    target.style.transition = 'background .5s';
    target.style.background = 'color-mix(in srgb, var(--accent) 18%, transparent)';
    setTimeout(() => { target.style.background = ''; }, 900);
  });
}
