/* Settings — API key, model, packing groups, backup, cache. */

import { h, svg, ICON, toast, openSheet, confirmSheet, downloadText, pickFile, errorSheet } from '../dom.js';
import { state, setSetting, getApiKey, setApiKey, exportBackup, importBackup, wipeAll, storageFailed } from '../store.js';
import { MODELS, CACHE_VERSION, APP_ID, KEY_STORE } from '../config.js';
import { openGroupEditor } from './groups.js';
import { testConnection, ApiError } from '../api.js';

function block(title, ...children) {
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { text: title })),
    h('div', { class: 'card-body' }, ...children));
}

export function openSettings(ctx) {
  openSheet({
    title: 'Innstillinger',
    full: true,
    build: (body, close, rerender) => {
      /* --- API key --- */
      const keyInput = h('input', {
        type: 'password', value: getApiKey(), placeholder: 'sk-ant-…', autocomplete: 'off',
        spellcheck: 'false', autocapitalize: 'off'
      });
      const show = h('button', {
        type: 'button', class: 'btn quiet sm', text: 'Vis', onClick: () => {
          keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
          show.textContent = keyInput.type === 'password' ? 'Vis' : 'Skjul';
        }
      });
      body.appendChild(block('Claude-nøkkel',
        h('div', { class: 'field' }, keyInput),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn sm', text: 'Lagre nøkkel', onClick: () => {
              const val = keyInput.value.trim();
              if (!setApiKey(val)) { toast('Klarte ikke å lagre', true); return; }
              if (val && !state.settings.keyWarningSeen) {
                setSetting('keyWarningSeen', true);
                openSheet({
                  title: 'Om nøkkelen',
                  build: (b, c) => {
                    b.append(
                      h('p', { class: 'sub', text: `Nøkkelen ligger i klartekst i nettleseren på denne telefonen, under ${KEY_STORE}. Alle apper på cheggenonline.github.io kan lese den, fordi de deler samme origin. Bruk en nøkkel du kan trekke tilbake, ikke hovednøkkelen din.` }),
                      h('button', { type: 'button', class: 'btn wide', text: 'Forstått', onClick: () => c() }));
                  }
                });
              }
              toast(val ? 'Nøkkelen er lagret' : 'Nøkkelen er fjernet');
              rerender();
            }
          }),
          show,
          h('button', {
            type: 'button', class: 'btn ghost sm', text: 'Test tilkobling', onClick: async (e) => {
              const btn = e.currentTarget;
              const was = btn.textContent;
              btn.textContent = 'Tester …';
              btn.disabled = true;
              try {
                const r = await testConnection(state.settings.model);
                toast(`Virker — svarte som ${r.model}`);
              } catch (err) {
                errorSheet({
                  title: 'Tilkoblingen feilet',
                  message: err instanceof ApiError ? err.message : 'Fikk ikke svar.',
                  detail: err && err.detail ? err.detail : null,
                  hint: 'Sjekk nøkkelen og valgt modell. Ingen data er sendt utover denne testen.'
                });
              } finally {
                btn.textContent = was;
                btn.disabled = false;
              }
            }
          })),
        h('p', { class: 'sub', style: 'margin-top:10px', text: 'Nøkkelen sendes bare til api.anthropic.com, aldri noe annet sted. Den ligger ukryptert på telefonen.' })));

      /* --- model --- */
      const model = h('select', {}, ...MODELS.map((m) => h('option', { value: m.id, text: m.label, selected: state.settings.model === m.id })));
      model.addEventListener('change', () => { setSetting('model', model.value); toast('Modell: ' + model.value); });
      body.appendChild(block('Modell',
        h('div', { class: 'field' }, model),
        h('p', { class: 'sub', style: 'margin:0', text: 'Ett kall per opptak. Alt annet regnes ut lokalt og virker uten nett.' })));

      /* --- groups --- */
      body.appendChild(block('Pakkegrupper',
        h('p', { class: 'sub', text: `${state.library.groups.length} grupper, ${state.library.neverSuggest.length} ting merket «aldri foreslå».` }),
        h('button', { type: 'button', class: 'btn wide', onClick: () => openGroupEditor() }, svg(ICON.archive, 18), ' Åpne grupperedigering')));

      /* --- trips --- */
      body.appendChild(block('Turer',
        h('p', { class: 'sub', text: `${state.trips.filter((t) => !t.archivedAt).length} aktive, ${state.trips.filter((t) => t.archivedAt).length} arkiverte.` }),
        h('button', { type: 'button', class: 'btn ghost wide', text: 'Bytt eller rediger tur', onClick: () => { close(); ctx.openTripMenu(); } })));

      /* --- backup --- */
      body.appendChild(block('Sikkerhetskopi',
        h('p', { class: 'sub', text: 'Alt ligger bare på denne telefonen. Ta en kopi før du bytter telefon eller tømmer nettleseren.' }),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn sm', text: 'Last ned JSON', onClick: () => {
              const d = new Date();
              const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
              downloadText(`travel-backup-${stamp}.json`, JSON.stringify(exportBackup(), null, 2));
              toast('Sikkerhetskopi lastet ned');
            }
          }),
          h('button', {
            type: 'button', class: 'btn ghost sm', text: 'Les inn fil', onClick: async () => {
              const files = await pickFile('application/json,.json');
              if (!files.length) return;
              let text;
              try { text = await files[0].text(); }
              catch (e) { toast('Klarte ikke å lese filen', true); return; }
              openSheet({
                title: 'Les inn kopi',
                build: (b, c) => {
                  b.append(
                    h('p', { class: 'sub', text: 'Slå sammen beholder det du har nå og legger til turer og grupper som mangler. Erstatt kaster alt du har.' }),
                    h('div', { class: 'btn-row' },
                      h('button', {
                        type: 'button', class: 'btn sm', text: 'Slå sammen', onClick: () => {
                          try { const r = importBackup(text, 'merge'); c(); close(); toast(`${r.trips} turer lest inn`); ctx.rerender(); }
                          catch (err) { toast(err.message, true); }
                        }
                      }),
                      h('button', {
                        type: 'button', class: 'btn bad sm', text: 'Erstatt alt', onClick: async () => {
                          if (!await confirmSheet({ title: 'Erstatt alt?', text: 'Alle turer og grupper på telefonen forsvinner.', confirmLabel: 'Erstatt', danger: true })) return;
                          try { const r = importBackup(text, 'replace'); c(); close(); toast(`${r.trips} turer lest inn`); ctx.rerender(); }
                          catch (err) { toast(err.message, true); }
                        }
                      })));
                }
              });
            }
          }))));

      /* --- app / cache --- */
      body.appendChild(block('Appen',
        h('p', { class: 'sub', text: `Versjon ${CACHE_VERSION}. Lagringsnøkler og cache er prefikset webapps.${APP_ID}, så appen ikke kolliderer med de andre appene på samme domene.` }),
        storageFailed() ? h('p', { class: 'sub', style: 'color:var(--danger)', text: 'Advarsel: nettleseren nektet å lagre. Er du i privat modus, eller er lagringen full?' }) : null,
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn ghost sm', text: 'Tøm cache og last på nytt', onClick: async () => {
              try {
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.filter((k) => k.startsWith(`webapps.${APP_ID}`)).map((k) => caches.delete(k)));
                }
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.filter((r) => (r.scope || '').includes(`/${APP_ID}/`)).map((r) => r.unregister()));
                }
              } catch (e) { /* nothing to clean */ }
              location.reload();
            }
          }),
          h('a', { class: 'btn quiet sm', href: '../', style: 'text-decoration:none', text: 'Til Webapps' }))));

      /* --- danger --- */
      body.appendChild(block('Slett alt',
        h('p', { class: 'sub', text: 'Fjerner alle turer, grupper og innstillinger fra denne telefonen. Nøkkelen beholdes.' }),
        h('button', {
          type: 'button', class: 'btn bad wide', text: 'Slett alle data', onClick: async () => {
            if (await confirmSheet({ title: 'Slette alt?', text: 'Dette kan ikke angres. Ta en sikkerhetskopi først.', confirmLabel: 'Slett alt', danger: true })) {
              wipeAll();
              close();
              toast('Alt er slettet');
              ctx.rerender();
            }
          }
        })));

      body.appendChild(h('p', { class: 'sub', style: 'text-align:center;margin-top:18px', text: 'Ingen konto, ingen server, ingen synk. Kalendereksport er den pålitelige påminnelsen — varsler i nettleseren virker bare mens appen er åpen.' }));
    }
  });
}
