/* Capture — one text area, a photo button, Submit. Nothing else.
   The text area takes dictation from the phone keyboard; there is deliberately
   no voice recording and no speech recognition in this app. */

import { h, svg, ICON, toast, pickFile, confirmSheet, iconBtn, errorSheet } from '../dom.js';
import { state, commit, setSetting, getApiKey } from '../store.js';
import { newCapture } from '../model.js';
import { analyseCapture, downscaleImage, ApiError } from '../api.js';
import { openReview } from './review.js';

/* Images live in memory only. They are input to interpret, never content to store. */
let pending = [];
let busy = false;

export function draftText() { return state.settings.captureDraft || ''; }
function setDraft(v) { state.settings.captureDraft = v; setSetting('captureDraft', v); }

export function renderCapture(main, trip, ctx) {
  const rerender = ctx.rerender;

  main.appendChild(h('div', { class: 'screen-head' },
    h('h1', { text: 'Fang opp' }),
    iconBtn('gear', 'Innstillinger', () => ctx.openSettings())
  ));

  const ta = h('textarea', {
    class: 'cap-ta',
    placeholder: 'Skriv eller diktér alt du har i hodet.\n\nSkal hente barna hos farmor 19:15, må pakke og innom apoteket …',
    value: draftText(),
    enterkeyhint: 'enter'
  });
  ta.addEventListener('input', () => setDraft(ta.value));

  const thumbs = h('div', { class: 'thumbs' });
  const hint = h('span', { class: 'hint', style: 'flex:1 1 auto' });
  const drawThumbs = () => {
    thumbs.replaceChildren(...pending.map((img, i) => h('div', { class: 'thumb' },
      h('img', { src: img.dataUrl, alt: 'Bilde ' + (i + 1) }),
      h('button', {
        type: 'button', 'aria-label': 'Fjern bilde ' + (i + 1),
        onClick: () => { pending.splice(i, 1); drawThumbs(); }
      }, '✕'))));
    hint.textContent = pending.length === 0
      ? 'Diktér med mikrofonen på tastaturet'
      : pending.length === 1
        ? '1 bilde i dette opptaket'
        : `${pending.length} bilder blir ett opptak`;
  };
  drawThumbs();

  const submit = h('button', { type: 'button', class: 'btn wide', disabled: busy },
    busy ? h('span', { class: 'spinner' }) : svg(ICON.spark, 18),
    busy ? ' Analyserer …' : ' Send til analyse');

  const addPhotos = async () => {
    const files = await pickFile('image/*', true);
    if (!files.length) return;
    for (const f of files) {
      try { pending.push(await downscaleImage(f)); }
      catch (e) { toast('Klarte ikke å lese ' + f.name, true); }
    }
    drawThumbs();
    toast(pending.length === 1 ? 'Bildet er klart' : `${pending.length} bilder er klare`);
  };

  const run = async () => {
    const text = ta.value.trim();
    if (!text && !pending.length) { toast('Skriv noe, eller legg til et bilde', true); return; }

    /* Never lose input: the capture is written down before the call goes out. */
    const capture = newCapture({
      inputType: pending.length && !text ? 'image' : 'text',
      text,
      imageData: pending.length ? pending.map((p) => ({ data: p.data, mediaType: p.mediaType })) : null
    });
    trip.captures.unshift(capture);
    commit('trips');

    if (!getApiKey()) {
      toast('Ingen API-nøkkel. Opptaket er lagret.', true);
      ctx.openSettings();
      rerender();
      return;
    }

    busy = true;
    rerender();
    try {
      const res = await analyseCapture({
        text, images: pending, trip, library: state.library, model: state.settings.model
      });
      busy = false;
      const images = pending;
      openReview({
        trip,
        analysis: res.analysis,
        captureId: capture.id,
        repaired: res.repaired || res.truncated,
        sourceText: text,
        images,
        ctx,
        onAccepted: () => { pending = []; setDraft(''); },
        onCancelled: () => { rerender(); }
      });
    } catch (err) {
      busy = false;
      rerender();
      reportFailure(err);
    }
  };

  submit.addEventListener('click', run);

  main.appendChild(h('div', { class: 'cap-wrap' },
    ta,
    thumbs,
    h('div', { class: 'cap-tools' },
      h('button', { type: 'button', class: 'btn ghost', onClick: addPhotos }, svg(ICON.camera, 18), ' Bilde'),
      hint),
    submit
  ));

  const drafts = (trip.captures || []).filter((c) => !c.resultSummary);
  if (drafts.length) {
    const card = h('div', { class: 'card', style: 'margin-top:18px' },
      h('div', { class: 'card-head' },
        h('h2', { text: 'Ikke analysert' }),
        h('span', { class: 'count', text: String(drafts.length) })));
    drafts.forEach((c) => {
      card.appendChild(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: (c.text || '(bare bilde)').slice(0, 120) }),
          h('div', { class: 'row-sub', text: new Date(c.at).toLocaleString('nb-NO') + (c.imageData ? ` · ${c.imageData.length} bilder` : '') })),
        h('button', {
          type: 'button', class: 'btn sm', text: 'Analyser', onClick: async () => {
            if (!getApiKey()) { toast('Legg inn API-nøkkel først', true); ctx.openSettings(); return; }
            busy = true; rerender();
            try {
              const res = await analyseCapture({
                text: c.text,
                images: (c.imageData || []).map((i) => ({ data: i.data, mediaType: i.mediaType })),
                trip, library: state.library, model: state.settings.model
              });
              busy = false;
              openReview({
                trip, analysis: res.analysis, captureId: c.id,
                repaired: res.repaired || res.truncated, sourceText: c.text, images: [],
                ctx, onAccepted: () => {}, onCancelled: () => rerender()
              });
            } catch (err) {
              busy = false;
              rerender();
              reportFailure(err);
            }
          }
        }),
        iconBtn('trash', 'Forkast opptaket', async () => {
          if (await confirmSheet({ title: 'Forkast opptaket?', text: c.text.slice(0, 200), confirmLabel: 'Forkast', danger: true })) {
            trip.captures = trip.captures.filter((x) => x.id !== c.id);
            commit('trips'); rerender();
          }
        })));
    });
    main.appendChild(card);
  }

  const analysed = (trip.captures || []).filter((c) => c.resultSummary);
  if (analysed.length) {
    main.appendChild(h('p', { class: 'hint', style: 'margin-top:14px', text: `${analysed.length} tidligere opptak i denne turen.` }));
  }
}

/* The capture is already saved by this point, so a failure costs nothing but a
   retry. Transient failures get a toast and stay out of the way; the ones that
   need a decision or need forwarding get the sheet, with the API's own wording. */
const TRANSIENT = ['rate', 'overloaded', 'server', 'offline', 'abort'];

function reportFailure(err) {
  const message = err instanceof ApiError ? err.message : 'Noe gikk galt under analysen.';
  const kind = err && err.kind ? err.kind : 'unknown';
  if (TRANSIENT.includes(kind)) { toast(message, true); return; }
  errorSheet({
    title: 'Analysen feilet',
    message,
    detail: err && err.detail ? err.detail : null,
    hint: 'Teksten ligger lagret under «Ikke analysert», så ingenting er tapt. Prøv igjen når feilen er rettet.'
  });
}

export function captureBusy() { return busy; }
