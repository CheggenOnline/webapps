/* Shell — header, status strip, bottom navigation, routing. */

import { h, svg, ICON, clear, toast, openSheet, sheetsOpen, closeTopSheet } from './dom.js';
import { state, subscribe, activeTrip, activeTrips, archivedTrips, selectTrip, addTrip, setSetting } from './store.js';
import { statusInfo, searchTrip } from './derive.js';
import { APP_ID, CACHE_VERSION } from './config.js';
import { renderTimeline } from './ui/timeline.js';
import { renderLists } from './ui/lists.js';
import { renderCapture } from './ui/capture.js';
import { renderVault } from './ui/vault.js';
import { renderSuggestions } from './ui/suggestions.js';
import { openSettings } from './ui/settings.js';
import { editTrip, editPeople } from './ui/editors.js';
import { offerSaveGroup } from './ui/groups.js';

const screenEl = document.getElementById('screen');
const navEl = document.getElementById('nav');
const tripBtn = document.getElementById('tripBtn');
const tripNameEl = document.getElementById('tripName');
const gearBtn = document.getElementById('gearBtn');
const stripPrimary = document.getElementById('stripPrimary');
const stripToggle = document.getElementById('stripToggle');
const stripText = document.getElementById('stripText');
const stripDot = document.getElementById('stripDot');
const stripMore = document.getElementById('stripMore');

const RENDERERS = {
  timeline: renderTimeline,
  lists: renderLists,
  capture: renderCapture,
  vault: renderVault,
  suggestions: renderSuggestions
};

let current = RENDERERS[state.settings.lastScreen] ? state.settings.lastScreen : 'timeline';
let afterCallbacks = [];

export const ctx = {
  focus: '',
  vaultQuery: '',
  go(screen, focus = '') {
    if (!RENDERERS[screen]) return;
    const changed = screen !== current;
    current = screen;
    ctx.focus = focus;
    if (screen !== 'suggestions') setSetting('lastScreen', screen);
    if (changed && !focus) window.scrollTo({ top: 0 });
    render();
  },
  rerender() { render(); },
  afterRender(fn) { afterCallbacks.push(fn); },
  openSearch,
  openSettings: () => openSettings(ctx),
  openTripMenu
};

/* ---------- render ---------- */

function render() {
  const trip = activeTrip();
  tripNameEl.textContent = trip ? trip.name : 'Travel';
  tripBtn.setAttribute('aria-label', trip ? `Tur: ${trip.name}. Bytt tur` : 'Velg tur');

  Array.from(navEl.querySelectorAll('.nav-btn')).forEach((b) => {
    if (b.dataset.screen === current) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  afterCallbacks = [];
  clear(screenEl);

  if (!trip) {
    screenEl.appendChild(h('div', { class: 'empty', style: 'margin-top:40px' },
      h('strong', { text: 'Ingen tur ennå' }),
      h('p', { text: 'En tur kan være en to ukers cruise eller en kveld hos besteforeldrene.' }),
      h('button', { type: 'button', class: 'btn', text: 'Lag en tur', onClick: () => editTrip(null, () => render()) })));
    renderStrip();
    return;
  }

  if (trip.archivedAt) {
    screenEl.appendChild(h('p', { class: 'notice', text: 'Denne turen er arkivert. Du kan se og endre den, men den ligger under skillelinjen i turlisten.' }));
  }

  try {
    RENDERERS[current](screenEl, trip, ctx);
  } catch (err) {
    screenEl.appendChild(h('div', { class: 'empty' },
      h('strong', { text: 'Noe gikk galt i visningen' }),
      h('p', { text: String(err && err.message ? err.message : err) }),
      h('button', { type: 'button', class: 'btn ghost', text: 'Prøv igjen', onClick: () => render() })));
  }

  renderStrip();
  const cbs = afterCallbacks;
  afterCallbacks = [];
  requestAnimationFrame(() => cbs.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }));
  ctx.focus = '';
}

/* ---------- status strip ---------- */

function renderStrip() {
  const trip = activeTrip();
  const info = statusInfo(trip, new Date());

  stripText.innerHTML = info.primary.text;
  stripDot.className = 'strip-dot ' + (info.primary.tone || '');
  stripPrimary.onclick = () => { if (info.primary.go) ctx.go(info.primary.go.screen, info.primary.go.focus || ''); };

  const expanded = !!state.settings.stripExpanded;
  stripToggle.setAttribute('aria-expanded', String(expanded));
  stripToggle.hidden = !info.chips.length;
  stripMore.hidden = !expanded || !info.chips.length;
  clear(stripMore);
  if (expanded) {
    info.chips.forEach((c) => {
      const b = h('button', { type: 'button', class: 'strip-chip' + (c.alert ? ' alert' : ''), html: c.text });
      b.addEventListener('click', () => ctx.go(c.go.screen, c.go.focus || ''));
      stripMore.appendChild(b);
    });
  }
  /* Main is padded from behind the fixed strip; expanded it grows, so measure. */
  requestAnimationFrame(() => {
    const el = document.getElementById('strip');
    if (el) screenEl.style.paddingTop = `calc(env(safe-area-inset-top) + var(--hdr-h) + ${el.offsetHeight}px + 8px)`;
  });
}

stripToggle.addEventListener('click', () => {
  setSetting('stripExpanded', !state.settings.stripExpanded);
  renderStrip();
});

/* ---------- trip menu ---------- */

function openTripMenu() {
  openSheet({
    title: 'Turer',
    build: (body, close) => {
      const trip = activeTrip();
      const item = (t) => h('button', {
        type: 'button', class: 'menu-item', 'aria-current': String(trip && t.id === trip.id),
        onClick: () => { selectTrip(t.id); close(); ctx.go('timeline'); }
      },
      h('div', { style: 'flex:1 1 auto;min-width:0' },
        h('div', { text: t.name }),
        h('span', { class: 'mi-sub', text: [t.kind, t.start ? `${t.start}${t.end ? ' → ' + t.end : ''}` : ''].filter(Boolean).join(' · ') || 'uten dato' })),
      trip && t.id === trip.id ? svg(ICON.check, 18) : null);

      const active = activeTrips();
      const archived = archivedTrips();

      active.forEach((t) => body.appendChild(item(t)));
      if (!active.length) body.appendChild(h('p', { class: 'sub', text: 'Ingen aktive turer.' }));

      if (archived.length) {
        body.appendChild(h('div', { class: 'menu-div', text: 'Arkivert' }));
        archived.forEach((t) => body.appendChild(item(t)));
      }

      body.appendChild(h('div', { class: 'menu-div', text: 'Handlinger' }));
      body.appendChild(h('button', {
        type: 'button', class: 'menu-item', onClick: () => {
          close();
          editTrip(null, (t) => { if (t) { ctx.go('capture'); toast('Turen er laget — dump inn planen'); } });
        }
      }, svg(ICON.plus, 18), h('span', { text: 'Ny tur' })));

      if (trip) {
        body.appendChild(h('button', {
          type: 'button', class: 'menu-item', onClick: () => {
            close();
            editTrip(trip, (t, action) => {
              if (action === 'archived') {
                /* Offered after a trip, never applied silently. */
                offerSaveGroup(trip, () => render());
              }
              render();
            });
          }
        }, svg(ICON.pencil, 18), h('span', { text: 'Rediger «' + trip.name + '»' })));
        body.appendChild(h('button', {
          type: 'button', class: 'menu-item', onClick: () => { close(); editPeople(trip, () => render()); }
        }, svg(ICON.gear, 18), h('span', { text: 'Folk på turen' })));
        body.appendChild(h('button', {
          type: 'button', class: 'menu-item', onClick: () => { close(); openSearch(); }
        }, svg(ICON.search, 18), h('span', { text: 'Søk i turen' })));
      }
    }
  });
}

/* ---------- search ---------- */

function openSearch() {
  const trip = activeTrip();
  if (!trip) return;
  openSheet({
    title: 'Søk i «' + trip.name + '»',
    full: true,
    build: (body, close) => {
      const input = h('input', { class: 'search', type: 'search', placeholder: 'Søk i hendelser, lister, oppslag' });
      const out = h('div', {});
      body.append(input, out);
      const draw = () => {
        clear(out);
        const q = input.value.trim();
        if (q.length < 2) { out.appendChild(h('p', { class: 'center-pad', text: 'Skriv minst to tegn.' })); return; }
        const hits = searchTrip(trip, q);
        if (!hits.length) { out.appendChild(h('p', { class: 'center-pad', text: 'Ingen treff.' })); return; }
        const card = h('div', { class: 'card' });
        hits.slice(0, 60).forEach((hit) => {
          card.appendChild(h('button', {
            type: 'button', class: 'row', onClick: () => { close(); ctx.go(hit.go.screen, hit.go.focus || ''); }
          },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: hit.label }),
            h('div', { class: 'row-sub' }, h('span', { class: 'tag', text: hit.kind }), hit.sub || '')),
          svg(ICON.chevron, 15)));
        });
        out.appendChild(card);
        if (hits.length > 60) out.appendChild(h('p', { class: 'sub', style: 'text-align:center', text: `Viser 60 av ${hits.length} treff.` }));
      };
      input.addEventListener('input', draw);
      draw();
      setTimeout(() => input.focus(), 80);
    }
  });
}

/* ---------- wiring ---------- */

tripBtn.addEventListener('click', openTripMenu);
gearBtn.addEventListener('click', () => openSettings(ctx));
navEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (btn) ctx.go(btn.dataset.screen);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetsOpen()) closeTopSheet(); });

/* The countdown in the strip has to keep moving. */
setInterval(() => { if (!sheetsOpen()) renderStrip(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStrip(); });

subscribe(() => { /* views re-render explicitly; this keeps the strip honest */ });

/* First run: a trip must exist for the app to be usable, and the review step
   will propose a real name later. Nothing else is required up front. */
if (!state.trips.length) addTrip({ name: 'Ny tur' });

render();

/* Service worker, scoped to this app's own folder. Never at the repo root —
   its scope would swallow the sibling apps on the same origin. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* offline is a bonus, not a requirement */ });
  });
}

if (window.location.search.includes('selftest')) {
  import('./parse.test.js').then((m) => {
    const r = m.run();
    toast(`Parser: ${r.passed} ok, ${r.failed} feil`, r.failed > 0);
  });
}

console.log(`travel ${CACHE_VERSION} — webapps.${APP_ID}`);
