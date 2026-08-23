/* Travel — constants. One APP_ID prefixes every stored key and cache name,
   because every app on cheggenonline.github.io shares one origin. */

export const APP_ID = 'travel';
export const NS = `webapps.${APP_ID}.`;

/* Repo convention (CONVENTIONS.md §4): a runtime API key lives in the shared slot
   so it is pasted once. On a shared origin any app can read it either way. */
export const KEY_STORE = 'webapps.shared.anthropicKey';

/* Bump on every deploy, or installed users keep serving the old files.
   Must match CACHE_VERSION in ../sw.js. */
export const CACHE_VERSION = 'v3';

export const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — standard' },
  { id: 'claude-opus-5', label: 'Opus 5 — grundigere, dyrere' }
];
export const DEFAULT_MODEL = 'claude-sonnet-5';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';

export const VAULT_CATEGORIES = [
  { id: 'identity', label: 'Identitet' },
  { id: 'booking', label: 'Booking' },
  { id: 'money', label: 'Penger' },
  { id: 'medical', label: 'Helse' },
  { id: 'connectivity', label: 'Nett' },
  { id: 'emergency', label: 'Nødnummer' },
  { id: 'note', label: 'Notater' },
  { id: 'other', label: 'Annet' }
];

export const LIST_KINDS = [
  { id: 'packing', label: 'Pakkeliste' },
  { id: 'todo', label: 'Oppgaver' },
  { id: 'shopping', label: 'Handleliste' },
  { id: 'generic', label: 'Liste' }
];

/* Caps from the spec: never propose more than three groups from one capture,
   and never more than eight gap suggestions. */
export const MAX_GROUPS_PER_CAPTURE = 3;
export const MAX_GAPS_PER_CAPTURE = 8;
export const MIN_GROUP_MATCHES = 2;
export const DISMISS_LIMIT = 2;

export const MAX_IMAGE_PX = 1400;
export const IMAGE_QUALITY = 0.72;
