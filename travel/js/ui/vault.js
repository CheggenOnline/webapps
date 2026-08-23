/* Vault — reference fields and notes, searchable, grouped by category, copied
   with one tap. Nothing here touches the network. */

import { h, svg, ICON, iconBtn, toast, copyText, openSheet } from '../dom.js';
import { VAULT_CATEGORIES } from '../config.js';
import { expiryState, expiryLabel } from '../derive.js';
import { normText } from '../model.js';
import { editVault } from './editors.js';

function vaultRow(trip, v, rerender) {
  const exp = expiryState(v);
  const meta = [];
  if (v.note) meta.push(h('span', { class: 'tag', text: v.note }));
  if (exp) meta.push(h('span', { class: 'tag ' + exp, text: expiryLabel(v) }));
  else if (v.expires) meta.push(h('span', { class: 'tag', text: expiryLabel(v) }));
  if (v.source === 'analysis') meta.push(h('span', { class: 'tag ai', text: 'fra opptak' }));

  const openEditor = () => editVault(trip, v, rerender);

  return h('div', { class: 'row', dataset: { key: 'vault:' + v.id } },
    h('button', {
      type: 'button', class: 'row-main', style: 'background:none;border:0;padding:0;text-align:left;color:inherit',
      onClick: openEditor
    },
    h('div', { class: 'row-title', style: 'font-size:.82rem;color:var(--muted)', text: v.label }),
    v.kind === 'note'
      ? h('div', { class: 'note-body', text: v.value })
      : h('div', { class: 'vault-val', text: v.value || '—' }),
    meta.length ? h('div', { class: 'row-sub' }, ...meta) : null,
    v.reason ? h('div', { class: 'reason', text: v.reason }) : null),
    v.kind === 'field' && v.value
      ? h('button', {
        type: 'button', class: 'copy', 'aria-label': 'Kopier ' + v.label,
        onClick: async (e) => {
          e.stopPropagation();
          const ok = await copyText(v.value);
          toast(ok ? v.label + ' kopiert' : 'Klarte ikke å kopiere', !ok);
        }
      }, svg(ICON.copy, 17))
      : iconBtn('pencil', 'Rediger ' + v.label, openEditor));
}

export function renderVault(main, trip, ctx) {
  const rerender = ctx.rerender;

  main.appendChild(h('div', { class: 'screen-head' },
    h('h1', { text: 'Oppslag' }),
    iconBtn('plus', 'Nytt oppslag', () => {
      openSheet({
        title: 'Legg til',
        build: (body, close) => {
          body.append(
            h('button', {
              type: 'button', class: 'btn wide', style: 'margin-bottom:10px',
              text: 'Verdi — kopieres med ett trykk', onClick: () => { close(); editVault(trip, null, rerender, 'field'); }
            }),
            h('button', {
              type: 'button', class: 'btn ghost wide',
              text: 'Notat — tittel og tekst', onClick: () => { close(); editVault(trip, null, rerender, 'note'); }
            }));
        }
      });
    })
  ));

  main.appendChild(h('p', { class: 'notice', text: 'Alt her ligger ukryptert på denne telefonen, og bare her. Ikke legg inn kort-PIN eller passord du ikke kan miste.' }));

  const search = h('input', { class: 'search', type: 'search', placeholder: 'Søk i oppslag', value: ctx.vaultQuery || '' });
  main.appendChild(search);

  const results = h('div', {});
  main.appendChild(results);

  const draw = () => {
    const q = normText(search.value);
    ctx.vaultQuery = search.value;
    results.replaceChildren();

    const items = trip.vault.filter((v) => !q || normText(v.label).includes(q) || normText(v.value).includes(q) || normText(v.note).includes(q));

    if (!trip.vault.length) {
      results.appendChild(h('div', { class: 'empty' },
        h('strong', { text: 'Tomt oppslagsverk' }),
        h('p', { text: 'Fotografer et pass eller en bookingbekreftelse i Fang opp, så havner feltene her. Eller legg inn ett selv.' }),
        h('div', { class: 'btn-row', style: 'justify-content:center' },
          h('button', { type: 'button', class: 'btn', text: 'Fang opp', onClick: () => ctx.go('capture') }),
          h('button', { type: 'button', class: 'btn ghost', text: 'Nytt oppslag', onClick: () => editVault(trip, null, rerender, 'field') }))));
      return;
    }
    if (!items.length) {
      results.appendChild(h('p', { class: 'center-pad', text: 'Ingen treff.' }));
      return;
    }

    /* A warning strip for anything with an expiry date coming up. The entries
       themselves stay under their own category, so nothing is listed twice. */
    const flagged = items.filter((v) => expiryState(v));
    if (flagged.length) {
      results.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('h2', { text: 'Utløper' }),
          h('span', { class: 'count', text: String(flagged.length) })),
        h('div', { class: 'card-body' },
          h('div', { class: 'chips' }, ...flagged.map((v) => h('button', {
            type: 'button', class: 'chip', onClick: () => editVault(trip, v, rerender)
          },
          h('b', { text: v.label }),
          h('span', { class: 'tag ' + expiryState(v), text: expiryLabel(v) })))))));
    }

    VAULT_CATEGORIES.forEach((cat) => {
      const group = items.filter((v) => v.category === cat.id);
      if (!group.length) return;
      const card = h('div', { class: 'card' }, h('div', { class: 'card-head' },
        h('h2', { text: cat.label }), h('span', { class: 'count', text: String(group.length) })));
      group.forEach((v) => card.appendChild(vaultRow(trip, v, rerender)));
      results.appendChild(card);
    });
  };

  search.addEventListener('input', draw);
  draw();

  ctx.afterRender(() => {
    if (!ctx.focus) return;
    const target = main.querySelector(`[data-key="${CSS.escape(ctx.focus)}"]`);
    if (!target) return;
    window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 150) });
  });
}
