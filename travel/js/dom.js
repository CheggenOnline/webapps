/* Small DOM helpers. No framework, no dependencies. */

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    Object.entries(props).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  children.flat(4).forEach((c) => {
    if (c === null || c === undefined || c === false || c === '') return;
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return parent;
}

export function frag(...children) { return append(document.createDocumentFragment(), children); }

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function svg(path, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('d', path);
  s.appendChild(p);
  return s;
}

export const ICON = {
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6Z',
  copy: 'M8 3h9a2 2 0 0 1 2 2v11h-2V5H8Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2m0 2v10h9V9Z',
  pencil: 'M4 17.3 16.7 4.6a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4L6.7 20H4Z',
  cal: 'M7 2h2v3h6V2h2v3h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2Zm12 8H5v10h14Z',
  search: 'M10 3a7 7 0 1 1-4.2 12.6l-2.1 2.1L2.3 16.3l2.1-2.1A7 7 0 0 1 10 3m0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
  trash: 'M9 3h6l1 2h4v2H4V5h4Zm-3 6h12l-1 12H7Z',
  camera: 'M9 4h6l1 2h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Zm3 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
  check: 'M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.2 8.4 18.8 7Z',
  chevron: 'M9 5.6 10.4 4.2 18.2 12l-7.8 7.8L9 18.4 15.4 12Z',
  back: 'M15 5.6 13.6 4.2 5.8 12l7.8 7.8L15 18.4 8.6 12Z',
  down: 'M12 16 5.6 9.6 7 8.2l5 5 5-5 1.4 1.4Z',
  link: 'M9 7h2v2H9a3 3 0 0 0 0 6h2v2H9A5 5 0 0 1 9 7m4 0h2a5 5 0 0 1 0 10h-2v-2h2a3 3 0 0 0 0-6h-2Zm-4 4h6v2H9Z',
  spark: 'M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6Zm6 11 .9 2.6L21 16.5l-2.1.9L18 20l-.9-2.6L15 16.5l2.1-.9Z',
  archive: 'M3 4h18v4H3Zm2 6h14v10H5Zm4 2v2h6v-2Z',
  gear: 'M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5m7.4-2.5a7.9 7.9 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4Z'
};

export function iconBtn(pathKey, label, onClick, cls = 'icon-btn') {
  return h('button', { type: 'button', class: cls, 'aria-label': label, onClick }, svg(ICON[pathKey] || pathKey, 20));
}

/* ---------- toast ---------- */

let toastHost;
export function toast(message, bad = false) {
  toastHost = toastHost || document.getElementById('toastHost');
  if (!toastHost) return;
  const el = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: message });
  toastHost.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, bad ? 3600 : 2200);
  setTimeout(() => el.remove(), bad ? 3950 : 2550);
}

/* ---------- sheets ---------- */

const stack = [];

function host() { return document.getElementById('sheetHost'); }

function syncHost() {
  const hostEl = host();
  if (!hostEl) return;
  clear(hostEl);
  if (!stack.length) { hostEl.hidden = true; document.body.style.overflow = ''; return; }
  hostEl.hidden = false;
  document.body.style.overflow = 'hidden';
  hostEl.appendChild(stack[stack.length - 1].el);
}

/* Returns { close, body, rerender } */
export function openSheet({ title, build, full = false, onClose, leftBtn }) {
  const bodyEl = h('div', { class: 'sheet-body' });
  const entry = {};
  const close = (result) => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    syncHost();
    if (onClose) onClose(result);
  };
  /* A form's action bar belongs to the sheet, not to the scrolling body: kept
     outside it, Save and Cancel are reachable without scrolling a long form and
     can never end up under the home indicator. Call sites still just append a
     .form-foot as the last thing they build; it gets moved here. */
  const footEl = h('div', { class: 'sheet-foot', hidden: true });
  const rerender = () => {
    clear(bodyEl);
    clear(footEl);
    build(bodyEl, close, rerender);
    const foot = bodyEl.querySelector(':scope > .form-foot:last-child');
    if (foot) { foot.remove(); footEl.appendChild(foot); }
    footEl.hidden = !footEl.childElementCount;
  };

  const head = h('div', { class: 'sheet-head' },
    leftBtn || null,
    h('h2', { text: title }),
    iconBtn('close', 'Lukk', () => close())
  );
  entry.el = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true' }, head, bodyEl, footEl);
  entry.close = close;
  stack.push(entry);
  syncHost();
  rerender();
  bodyEl.scrollTop = 0;
  return { close, body: bodyEl, rerender };
}

export function closeTopSheet() { if (stack.length) stack[stack.length - 1].close(); }
export function sheetsOpen() { return stack.length; }

/* ---------- confirm / prompt ---------- */

export function confirmSheet({ title, text, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    openSheet({
      title,
      onClose: () => done(false),
      build: (body, close) => {
        if (text) body.appendChild(h('p', { class: 'sub', text }));
        body.appendChild(h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => { done(false); close(); } }),
          h('button', { type: 'button', class: 'btn' + (danger ? ' bad' : ''), text: confirmLabel, onClick: () => { done(true); close(); } })
        ));
      }
    });
  });
}

export function promptSheet({ title, label, value = '', placeholder = '', multiline = false, confirmLabel = 'Lagre', hint = '' }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    openSheet({
      title,
      onClose: () => done(null),
      build: (body, close) => {
        const input = multiline
          ? h('textarea', { value, placeholder })
          : h('input', { type: 'text', value, placeholder, enterkeyhint: 'done' });
        body.appendChild(h('div', { class: 'field' }, label ? h('label', { text: label }) : null, input));
        if (hint) body.appendChild(h('p', { class: 'sub', text: hint }));
        const submit = () => { done(input.value.trim()); close(); };
        if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        body.appendChild(h('div', { class: 'form-foot' },
          h('button', { type: 'button', class: 'btn ghost', text: 'Avbryt', onClick: () => { done(null); close(); } }),
          h('button', { type: 'button', class: 'btn', text: confirmLabel, onClick: submit })
        ));
        setTimeout(() => input.focus(), 60);
      }
    });
  });
}

/* An error the user can act on, or forward. `detail` is the API's own wording —
   a friendly sentence alone leaves you guessing at what actually broke. */
export function errorSheet({ title = 'Det gikk ikke', message, detail, hint }) {
  openSheet({
    title,
    build: (body, close) => {
      body.appendChild(h('p', { style: 'margin:0 0 12px', text: message }));
      if (hint) body.appendChild(h('p', { class: 'sub', text: hint }));
      if (detail) {
        const box = h('div', { class: 'notice', style: 'font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;display:none', text: detail });
        const toggle = h('button', {
          type: 'button', class: 'btn quiet wide', text: 'Vis detaljer', onClick: () => {
            const shown = box.style.display !== 'none';
            box.style.display = shown ? 'none' : 'block';
            toggle.textContent = shown ? 'Vis detaljer' : 'Skjul detaljer';
          }
        });
        body.append(toggle, box, h('button', {
          type: 'button', class: 'btn quiet wide', style: 'margin-top:8px', text: 'Kopier detaljene',
          onClick: async () => { toast(await copyText(detail) ? 'Kopiert' : 'Klarte ikke å kopiere'); }
        }));
      }
      body.appendChild(h('button', { type: 'button', class: 'btn wide', style: 'margin-top:14px', text: 'Lukk', onClick: () => close() }));
    }
  });
}

/* ---------- misc ---------- */

export async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(value); return true; }
  } catch (e) { /* fall through to the textarea trick */ }
  try {
    const ta = h('textarea', { value, style: 'position:fixed;top:-1000px;opacity:0' });
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: 'position:fixed;top:-1000px;opacity:0' });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(files);
    });
    input.click();
  });
}
