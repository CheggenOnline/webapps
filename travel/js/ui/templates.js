/* Standard packing lists — ready-made lists the user can append to a trip.

   They are content, not learning: the built-ins below never change and are
   never stored, and nothing is added to a trip until he has picked the lines
   and pressed the button. His own saved groups appear in the same picker,
   because from here they are the same thing — a list of things to append. */

import { h, svg, ICON, toast, openSheet } from '../dom.js';
import { state, commit, saveLibrary } from '../store.js';
import { newEntry, newList, normText } from '../model.js';

/* Built-in lists. Norwegian, because the app is. Each one is short enough to
   read on a phone without scrolling past the point of deciding. */
export const STANDARD_LISTS = [
  {
    id: 'grunnpakke',
    name: 'Grunnpakke',
    hint: 'Det som blir med uansett hvor turen går',
    items: ['Undertøy', 'Sokker', 'T-skjorter', 'Bukse', 'Genser', 'Pysjamas', 'Jakke', 'Lommebok', 'Nøkler', 'Solbriller', 'Handlenett']
  },
  {
    id: 'toalettmappe',
    name: 'Toalettmappe',
    hint: 'Den som alltid mangler én ting',
    items: ['Tannbørste', 'Tannkrem', 'Deodorant', 'Sjampo', 'Dusjsåpe', 'Hårbørste', 'Barbersaker', 'Neglklipper', 'Solkrem', 'Fuktighetskrem', 'Q-tips']
  },
  {
    id: 'fly',
    name: 'Fly og håndbagasje',
    hint: 'Det som må være med i kabinen, ikke i kofferten',
    items: ['Pass', 'Boardingkort', 'Væske i klarpose (maks 100 ml)', 'Powerbank i håndbagasjen', 'Faste medisiner i håndbagasjen', 'Ett skift i håndbagasjen', 'Øreplugger', 'Nakkepute', 'Tom drikkeflaske', 'Lesestoff']
  },
  {
    id: 'elektronikk',
    name: 'Elektronikk',
    hint: 'Ladere er det som oftest blir igjen hjemme',
    items: ['Telefonlader', 'Powerbank', 'Hodetelefoner', 'Reiseadapter', 'Multiuttak', 'Klokkelader', 'Nettbrett eller lesebrett', 'Kamera og minnekort']
  },
  {
    id: 'dokumenter',
    name: 'Dokumenter og penger',
    hint: 'Sjekk gyldighet før du pakker',
    items: ['Pass', 'Førerkort', 'Reiseforsikringsbevis', 'Europeisk helsetrygdkort', 'Bankkort', 'Kontanter i lokal valuta', 'Billetter og bookingbekreftelser', 'Vaksinekort']
  },
  {
    id: 'apotek',
    name: 'Apotek og førstehjelp',
    hint: 'Lite å bære, mye å angre på',
    items: ['Faste medisiner', 'Plaster', 'Paracet', 'Ibux', 'Reisesykepiller', 'Antihistamin', 'Antibac', 'Sårsalve', 'Myggmiddel']
  },
  {
    id: 'hytte',
    name: 'Hytte',
    hint: 'Det hytta sjelden har selv',
    items: ['Sengetøy', 'Håndklær', 'Ullsokker', 'Innesko', 'Hodelykt', 'Fyrstikker', 'Søppelsekker', 'Oppvaskmiddel', 'Kaffe', 'Kortstokk eller spill']
  },
  {
    id: 'strand',
    name: 'Strand og sommer',
    hint: 'Varmt vær, lite klær, mye solkrem',
    items: ['Badetøy', 'Badehåndkle', 'Solkrem', 'Solhatt', 'Sandaler', 'Etter-sol-lotion', 'Myggmiddel', 'Strandleker', 'Kjølebag']
  },
  {
    id: 'vinter',
    name: 'Vinter og ski',
    hint: 'Lag på lag, og noe tørt å bytte til',
    items: ['Ullundertøy', 'Skallbukse', 'Skalljakke', 'Votter', 'Lue', 'Buff', 'Skibriller', 'Termos', { text: 'Ullsokker', qty: 3 }]
  },
  {
    id: 'barn',
    name: 'Med barn',
    hint: 'Reisen varer lenger enn tålmodigheten',
    items: ['Bleier', 'Våtservietter', { text: 'Skift', qty: 2 }, 'Kosedyr', 'Snacks til reisen', 'Febernedsettende til barn', 'Barnesolkrem', 'Drikkeflaske', 'Aktiviteter eller spill']
  },
  {
    id: 'bil',
    name: 'Bilferie',
    hint: 'Papirer i hanskerommet og noe å høre på',
    items: ['Førerkort', 'Vognkort', 'Bombrikke', 'Ladekabel til bilen', 'Isskrape', 'Refleksvest', 'Varseltrekant', 'Snacks og drikke', 'Musikk eller podkast offline', 'Søppelpose til bilen']
  },
  {
    id: 'jobb',
    name: 'Jobbreise',
    hint: 'Det du ikke kan kjøpe i resepsjonen',
    items: ['Laptop og lader', 'Skjorte', 'Dressjakke', 'Pene sko', 'Notatbok og penn', 'Adgangskort', 'Visittkort', 'Mappe til kvitteringer']
  }
];

function normMember(m) {
  if (typeof m === 'string') return { text: m, qty: null, forPerson: '' };
  return { text: String(m.text || ''), qty: typeof m.qty === 'number' ? m.qty : null, forPerson: String(m.forPerson || '') };
}

/* Built-ins first, then his own groups — most used first, as in the group
   editor. A group with no members is not offered; there is nothing to append. */
function sources() {
  const std = STANDARD_LISTS.map((t) => ({
    key: 'std:' + t.id,
    name: t.name,
    hint: t.hint,
    groupId: '',
    members: t.items.map(normMember)
  }));
  const own = state.library.groups
    .filter((g) => g.members.length)
    .slice()
    .sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name, 'nb'))
    .map((g) => ({
      key: 'grp:' + g.id,
      name: g.name,
      hint: g.usedCount ? `Din egen gruppe · brukt ${g.usedCount}×` : 'Din egen gruppe',
      groupId: g.id,
      members: g.members.map(normMember)
    }));
  return { std, own };
}

/* Everything already on the trip, so a line he has is never offered twice. */
function existingTexts(trip) {
  const set = new Set();
  (trip?.lists || []).forEach((l) => l.entries.forEach((e) => {
    const n = normText(e.text);
    if (n) set.add(n);
  }));
  return set;
}

/* Append into the packing list he already has, not a new one beside it. */
function packingTitle(trip) {
  const existing = trip.lists.find((l) => !l.archived && l.kind === 'packing');
  return existing ? existing.title : 'Pakkeliste';
}

/* One List per source name, sharing the packing list's title — that is how the
   Lists screen renders "one packing list with a heading per group". */
function targetList(trip, title, heading) {
  const found = trip.lists.find((l) => !l.archived && l.kind === 'packing'
    && normText(l.title) === normText(title) && normText(l.groupHint) === normText(heading));
  if (found) return found;
  const list = newList({ kind: 'packing', title, groupHint: heading });
  trip.lists.push(list);
  return list;
}

/* picks: [{ source, member }]. Returns the id the Lists screen uses as the
   card's key — the first non-archived list sharing the packing title, which is
   the one listGroups() puts the card's data-key on. */
function appendPicks(trip, picks) {
  const title = packingTitle(trip);
  const used = new Set();
  picks.forEach(({ source, member }) => {
    const list = targetList(trip, title, source.name);
    list.entries.push(newEntry({
      text: member.text,
      qty: member.qty ?? null,
      forPerson: member.forPerson || '',
      groupId: source.groupId,
      source: 'group'
    }));
    if (source.groupId) used.add(source.groupId);
  });
  commit('trips');
  if (used.size) {
    state.library.groups.forEach((g) => {
      if (used.has(g.id)) { g.usedCount += 1; g.updatedAt = new Date().toISOString(); }
    });
    saveLibrary();
  }
  const card = trip.lists.find((l) => !l.archived && normText(l.title) === normText(title));
  return card ? card.id : '';
}

/* onDone(listId) is called only when something was actually added. */
export function openTemplatePicker(trip, onDone) {
  const chosen = new Set();   /* `${source.key}|${index}` */
  const opened = new Set();   /* which cards are expanded */
  const have = existingTexts(trip);

  const keyOf = (source, i) => source.key + '|' + i;
  const isNew = (member) => !have.has(normText(member.text));
  const freeMembers = (source) => source.members.map((m, i) => ({ m, i })).filter(({ m }) => isNew(m));

  openSheet({
    title: 'Legg til liste',
    full: true,
    build: (body, close, rerender) => {
      const { std, own } = sources();

      body.appendChild(h('p', { class: 'sub', text: 'Ferdige lister du kan legge til i turen. Åpne en liste for å velge enkeltting — det du allerede har står som det, og legges ikke til på nytt.' }));

      const card = (source) => {
        const free = freeMembers(source);
        const picked = free.filter(({ i }) => chosen.has(keyOf(source, i))).length;
        const box = h('div', { class: 'card' });
        const isOpen = opened.has(source.key);

        box.appendChild(h('button', {
          type: 'button', class: 'card-head',
          style: 'width:100%;background:none;border-left:0;border-right:0;border-top:0;color:inherit;text-align:left;min-height:var(--tap)',
          'aria-expanded': String(isOpen),
          onClick: () => { if (isOpen) opened.delete(source.key); else opened.add(source.key); rerender(); }
        },
        h('span', { style: 'flex:1 1 auto;min-width:0;font-size:.98rem;font-weight:640', text: source.name }),
        h('span', { class: 'count', text: picked ? `${picked} valgt` : (free.length ? `${free.length} ting` : 'alt i turen') }),
        h('span', { style: 'flex:none;display:grid;place-items:center;transform:rotate(' + (isOpen ? '0' : '-90') + 'deg)' }, svg(ICON.down, 18))));

        if (!isOpen) {
          box.appendChild(h('div', { class: 'card-body' },
            h('p', { class: 'sub', style: 'margin:0', text: source.members.map((m) => m.text + (m.qty ? ` ×${m.qty}` : '')).join(' · ') })));
          return box;
        }

        box.appendChild(h('div', { class: 'card-body', style: 'padding-bottom:0' },
          h('p', { class: 'sub', style: 'margin:0 0 10px', text: source.hint }),
          free.length ? h('button', {
            type: 'button', class: 'btn quiet sm',
            text: picked === free.length ? 'Fjern alle' : 'Velg alle',
            onClick: () => {
              if (picked === free.length) free.forEach(({ i }) => chosen.delete(keyOf(source, i)));
              else free.forEach(({ i }) => chosen.add(keyOf(source, i)));
              rerender();
            }
          }) : h('p', { class: 'sub', style: 'margin:0', text: 'Alt i denne listen ligger allerede i turen.' })));

        source.members.forEach((m, i) => {
          const already = !isNew(m);
          const on = chosen.has(keyOf(source, i));
          if (already) {
            box.appendChild(h('div', { class: 'sel-row off' },
              h('span', { class: 'tick', style: 'visibility:hidden' }),
              h('div', { class: 'sel-body' },
                h('div', { class: 'row-title', text: m.text }),
                h('div', { class: 'row-sub' }, h('span', { class: 'tag', text: 'alt i turen' })))));
            return;
          }
          box.appendChild(h('button', {
            /* Unselected rows stay at full strength — the empty box is the
               affordance. Only the lines he already has are dimmed. */
            type: 'button', class: 'sel-row',
            style: 'width:100%;background:none;border-left:0;border-right:0;border-bottom:0;color:inherit;text-align:left;min-height:var(--tap)',
            'aria-pressed': String(on),
            onClick: () => { if (on) chosen.delete(keyOf(source, i)); else chosen.add(keyOf(source, i)); rerender(); }
          },
          /* aria-pressed on the box is the stylesheet's hook for the filled
             state; the button around it carries the state for a screen reader. */
          h('span', { class: 'tick', 'aria-hidden': 'true', 'aria-pressed': String(on) }, svg(ICON.check, 17)),
          h('div', { class: 'sel-body' },
            h('div', { class: 'row-title', text: m.text }),
            (m.qty || m.forPerson) ? h('div', { class: 'row-sub' },
              m.qty ? h('span', { class: 'tag', text: '×' + m.qty }) : null,
              m.forPerson ? h('span', { class: 'tag person', text: m.forPerson }) : null) : null)));
        });

        return box;
      };

      std.forEach((s) => body.appendChild(card(s)));

      body.appendChild(h('div', { class: 'menu-div', text: 'Dine egne pakkegrupper' }));
      if (!own.length) {
        body.appendChild(h('p', { class: 'sub', text: 'Ingen grupper med innhold ennå. Du får tilbud om å lagre en når du arkiverer en tur, og kan lage dem under Innstillinger → Pakkegrupper.' }));
      } else {
        own.forEach((s) => body.appendChild(card(s)));
      }

      const total = chosen.size;
      body.appendChild(h('div', { class: 'form-foot' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => close() }),
        h('button', {
          type: 'button', class: 'btn', disabled: total === 0,
          text: total ? `Legg til ${total} ting` : 'Ingenting valgt',
          onClick: () => {
            const picks = [];
            [...std, ...own].forEach((source) => {
              source.members.forEach((m, i) => { if (chosen.has(keyOf(source, i))) picks.push({ source, member: m }); });
            });
            if (!picks.length) return;
            const listId = appendPicks(trip, picks);
            close();
            toast(`${picks.length} ting lagt til i ${packingTitle(trip)}`);
            if (onDone) onDone(listId);
          }
        })));
    }
  });
}
