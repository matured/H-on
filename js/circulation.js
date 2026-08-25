/* ============================================
   本 (HON) — CIRCULATION STATE (shared)
   Checkout / return / queue logic used by both
   the Archive browse page and individual item pages.
   State lives in Supabase now — see supabase/migrations/.
   honState is an in-memory cache, populated by fetching
   from the server, not the source of truth itself.
   ============================================ */

let honState = {};

// Catalog metadata used to be the static array in js/catalog-data.js;
// as of T12 it's real rows in public.items (title/cover/description
// columns added alongside the copies_total column that was already
// there). honFetchCatalog() populates this global once per page load —
// every page that reads HON_CATALOG must await it first.
let HON_CATALOG = [];

const HON_ITEM_COLUMNS = 'item_id, title, subtitle, issue, era, genre, call_number, copies_total, cover_bg, cover_fg, cover_accent, cover_image, back_image, description';

function honMapItemRow(row) {
  return {
    id: row.item_id,
    title: row.title,
    subtitle: row.subtitle || undefined,
    issue: row.issue,
    era: row.era,
    genre: row.genre,
    call: row.call_number,
    copiesTotal: row.copies_total,
    coverBg: row.cover_bg,
    coverFg: row.cover_fg,
    coverAccent: row.cover_accent,
    coverImage: row.cover_image || undefined,
    backImage: row.back_image || undefined,
    desc: row.description,
  };
}

async function honFetchCatalog() {
  const { data, error } = await honSupabase
    .from('items')
    .select(HON_ITEM_COLUMNS)
    .order('item_id', { ascending: true });
  if (error) throw error;
  HON_CATALOG = (data || []).map(honMapItemRow);
  return HON_CATALOG;
}

// item.html only ever needs the one title it's displaying — pulling the
// whole catalog there (as honFetchCatalog does, correctly, for the
// browse/shelf page) means downloading every other item's metadata just
// to throw it away, and that cost grows with the catalog size instead of
// staying flat per item view.
async function honFetchOneItem(itemId) {
  const { data, error } = await honSupabase
    .from('items')
    .select(HON_ITEM_COLUMNS)
    .eq('item_id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data ? honMapItemRow(data) : null;
}

// Every field interpolated into innerHTML below is admin-writable (catalog
// titles/descriptions, cover hex colors) or comes straight from a thrown
// error message — never assume either is script-free just because only
// admins can currently write it. Escaping here is the actual security
// boundary, not the RPC's is_admin() check, which only decides who can
// write, not what gets rendered.
function honEscape(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  // The textContent/innerHTML round trip only escapes &, <, > — those are
  // the only characters special in element CONTENT. This helper is also
  // used inside attribute values (style="...", alt="...") throughout the
  // codebase, where an unescaped " or ' breaks out of the attribute, so
  // both get escaped explicitly here too.
  return div.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function honFormatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
}

// ---- auth ----

async function honGetCurrentUser() {
  // getSession() reads the locally cached session — no network call, so no
  // noise when nobody's logged in (the common case on every page load).
  // The RPC functions themselves still validate the JWT server-side, so
  // this doesn't weaken anything — it just avoids an unnecessary round
  // trip (and the 400 it produces) purely to decide whether to attempt one.
  const { data: { session } } = await honSupabase.auth.getSession();
  return session?.user ?? null;
}

async function honSignInWithEmail(email) {
  const { error } = await honSupabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/membership.html' },
  });
  if (error) throw error;
}

// Deletes the signed-in user's account via the delete_my_account RPC (see
// supabase/migrations/20260814230000_account_deletion.sql), then signs out
// locally — the server-side row is already gone, so there's no session left
// to keep. The RPC itself raises a descriptive error for the two cases it
// blocks (admin account, active loan); this just lets those surface as-is.
async function honDeleteMyAccount() {
  const { error } = await honSupabase.rpc('delete_my_account');
  if (error) throw error;
  await honSupabase.auth.signOut();
}

// ---- library cards ----

// Cards this signed-in user has to give out (issued_by = them), whether
// still unused or already claimed by someone. RLS already restricts this
// query to the caller's own rows.
async function honFetchMyCards() {
  const user = await honGetCurrentUser();
  if (!user) return null;
  const { data, error } = await honSupabase
    .from('library_cards')
    .select('id, code, issued_at, claimed_at')
    .eq('issued_by', user.id)
    .order('issued_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function honValidateCardCode(code) {
  const { data, error } = await honSupabase.rpc('validate_card_code', { p_code: code });
  if (error) throw error;
  return !!data;
}

async function honRedeemCard(code) {
  const { error } = await honSupabase.rpc('redeem_card', { p_code: code });
  if (error) throw error;
}

// A card code has to survive the magic-link round trip: the user enters it,
// we send the email, the browser navigates away and comes back signed in
// (possibly as a fresh page load), and only then can redeem_card actually
// run (it requires auth.uid()). localStorage is just carrying that one
// value across the redirect — it is not standing in for circulation state.
const HON_PENDING_CARD_KEY = 'hon_pending_card_code';

function honStashPendingCardCode(code) {
  localStorage.setItem(HON_PENDING_CARD_KEY, code);
}

function honTakePendingCardCode() {
  const code = localStorage.getItem(HON_PENDING_CARD_KEY);
  localStorage.removeItem(HON_PENDING_CARD_KEY);
  return code;
}

// ---- admin ----
// All admin_* RPCs gate on is_admin() server-side — these wrappers add no
// client-side authorization of their own, they just surface what the RPC
// returns (or the "admin only" error it raises for a non-admin caller).

async function honFetchMyProfile() {
  const user = await honGetCurrentUser();
  if (!user) return null;
  const { data, error } = await honSupabase
    .from('profiles')
    .select('user_id, is_admin, banned')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function honAdminListProfiles() {
  const { data, error } = await honSupabase.rpc('admin_list_profiles');
  if (error) throw error;
  return data || [];
}

async function honAdminListLoans() {
  const { data, error } = await honSupabase.rpc('admin_list_loans');
  if (error) throw error;
  return data || [];
}

async function honAdminForceReturn(loanId) {
  const { error } = await honSupabase.rpc('admin_force_return', { p_loan_id: loanId });
  if (error) throw error;
}

async function honAdminIssueCard() {
  const { data, error } = await honSupabase.rpc('admin_issue_card');
  if (error) throw error;
  return data;
}

async function honAdminSetBanned(userId, banned) {
  const { error } = await honSupabase.rpc('admin_set_banned', { p_user_id: userId, p_banned: banned });
  if (error) throw error;
}

async function honAdminListWaitlist() {
  const { data, error } = await honSupabase.rpc('admin_list_waitlist');
  if (error) throw error;
  return data || [];
}

async function honAdminAcceptWaitlistRequest(requestId) {
  const { data, error } = await honSupabase.rpc('admin_accept_waitlist_request', { p_request_id: requestId });
  if (error) throw error;
  return data;
}

async function honAdminDeclineWaitlistRequest(requestId) {
  const { error } = await honSupabase.rpc('admin_decline_waitlist_request', { p_request_id: requestId });
  if (error) throw error;
}

// ---- dengonban (T17, corkboard redesign T18) ----
// Must match the check constraint on dengonban_messages.color and the
// runtime check in post_dengonban_message (20260825010000_dengonban_corkboard.sql).
const HON_DENGONBAN_COLORS = ['#fef3c7', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#ddd6fe'];

// Anonymous posters have no account to rate-limit against, so the post RPC
// is throttled by this client-generated token instead (see
// check_anon_dengonban_rate_limit, 20260825000000_dengonban_anon_rate_limit.sql).
// Same "carry one value across calls via localStorage" shape as
// HON_PENDING_CARD_KEY above, not standing in for any real identity.
const HON_ANON_TOKEN_KEY = 'hon_dengonban_anon_token';

function honGetOrCreateAnonToken() {
  let token = localStorage.getItem(HON_ANON_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(HON_ANON_TOKEN_KEY, token);
  }
  return token;
}

// Public read goes straight through PostgREST (RLS already limits it to
// non-hidden, non-expired rows) rather than an RPC — there's no
// is_admin()-style gate to enforce here, just render-sanity capping.
async function honFetchDengonban() {
  const { data, error } = await honSupabase
    .from('dengonban_messages')
    .select('id, body, created_at, color, pos_x, pos_y, doodle')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function honPostDengonban(body, { color, x, y, doodle = null } = {}) {
  const user = await honGetCurrentUser();
  const { data, error } = await honSupabase.rpc('post_dengonban_message', {
    p_body: body,
    p_color: color,
    p_pos_x: x,
    p_pos_y: y,
    p_doodle: doodle,
    p_anon_token: user ? null : honGetOrCreateAnonToken(),
  });
  if (error) throw error;
  return data;
}

async function honAdminListDengonban() {
  const { data, error } = await honSupabase.rpc('admin_list_dengonban');
  if (error) throw error;
  return data || [];
}

async function honAdminHideDengonban(id) {
  const { error } = await honSupabase.rpc('admin_hide_dengonban_message', { p_id: id });
  if (error) throw error;
}

// item: same shape as a HON_CATALOG entry (id, title, subtitle, issue,
// era, genre, call, copiesTotal, coverBg, coverFg, coverAccent,
// coverImage, backImage, desc) — admin.html's form reads/writes that
// shape directly, this just renames to the RPC's column names.
async function honAdminUpsertItem(item) {
  const { data, error } = await honSupabase.rpc('admin_upsert_item', {
    p_item_id: item.id,
    p_title: item.title,
    p_subtitle: item.subtitle || null,
    p_issue: item.issue,
    p_era: item.era,
    p_genre: item.genre,
    p_call_number: item.call,
    p_copies_total: item.copiesTotal,
    p_cover_bg: item.coverBg,
    p_cover_fg: item.coverFg,
    p_cover_accent: item.coverAccent,
    p_cover_image: item.coverImage || null,
    p_back_image: item.backImage || null,
    p_description: item.desc,
  });
  if (error) throw error;
  return data;
}

// Every cover, regardless of what the admin uploads (a raw phone photo of
// a magazine, a giant flatbed scan, whatever), gets normalized client-side
// into 4 fixed files before it ever reaches Storage:
//   {side}.jpg        full size, capped at 1400px long edge — the hero/
//                      detail view on item.html
//   {side}.webp       same dimensions, WebP (smaller, modern browsers)
//   {side}-grid.jpg   760px wide — the Archive shelf thumbnail
//   {side}-grid.webp  same, WebP
// Fixed filenames (not derived from the source extension) means no stale
// leftover file from a previous upload of a different type — every
// re-upload just upserts the same 4 paths.
const HON_COVER_FULL_MAX = 1400;
const HON_COVER_GRID_WIDTH = 760;

function honLoadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image file')); };
    img.src = url;
  });
}

function honDrawToCanvas(img, maxDimOrWidth, byWidth) {
  const scale = byWidth
    ? Math.min(1, maxDimOrWidth / img.naturalWidth)
    : Math.min(1, maxDimOrWidth / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function honCanvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality);
  });
}

async function honUploadCoverImage(itemId, side, file) {
  const img = await honLoadImageElement(file);
  const fullCanvas = honDrawToCanvas(img, HON_COVER_FULL_MAX, false);
  const gridCanvas = honDrawToCanvas(img, HON_COVER_GRID_WIDTH, true);

  const variants = await Promise.all([
    honCanvasToBlob(fullCanvas, 'image/jpeg', 0.85).then(blob => [`${itemId}/${side}.jpg`, blob, 'image/jpeg']),
    honCanvasToBlob(fullCanvas, 'image/webp', 0.8).then(blob => [`${itemId}/${side}.webp`, blob, 'image/webp']),
    honCanvasToBlob(gridCanvas, 'image/jpeg', 0.82).then(blob => [`${itemId}/${side}-grid.jpg`, blob, 'image/jpeg']),
    honCanvasToBlob(gridCanvas, 'image/webp', 0.8).then(blob => [`${itemId}/${side}-grid.webp`, blob, 'image/webp']),
  ]);

  for (const [path, blob, contentType] of variants) {
    const { error } = await honSupabase.storage.from('covers').upload(path, blob, { upsert: true, contentType });
    if (error) throw error;
  }

  const { data } = honSupabase.storage.from('covers').getPublicUrl(`${itemId}/${side}.jpg`);
  return data.publicUrl;
}

// Derives a sibling variant's URL from a stored coverImage/backImage URL
// by suffix convention, rather than storing 4 URLs per side in the
// database. Works identically for the local images/covers/*.jpg seed
// paths and full Supabase Storage URLs, since it's pure string surgery
// on whatever URL is already there.
function honImageVariant(url, { grid = false, webp = false } = {}) {
  if (!url) return url;
  const dot = url.lastIndexOf('.');
  if (dot === -1) return url;
  const base = url.slice(0, dot);
  const ext = webp ? 'webp' : url.slice(dot + 1);
  return `${base}${grid ? '-grid' : ''}.${ext}`;
}

// ---- notifications ----
// A nudge, not a reservation: return_item/admin_force_return insert one
// of these for whoever's been waiting longest on an item, but it doesn't
// hold the item or block anyone else from checking it out first.

async function honFetchMyNotifications() {
  const user = await honGetCurrentUser();
  if (!user) return [];
  const { data, error } = await honSupabase
    .from('notifications')
    .select('id, item_id, created_at')
    .eq('user_id', user.id)
    .is('read_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function honMarkNotificationRead(id) {
  const { error } = await honSupabase.rpc('mark_notification_read', { p_id: id });
  if (error) throw error;
}

// ---- status fetching ----

// Fetches one item's status: public aggregate counts (from the
// item_availability view) plus, if signed in, whether THIS user holds it
// or is queued for it (from loans/queue_entries, which RLS already
// restricts to the caller's own rows).
async function honFetchStatus(itemId) {
  const { data: avail, error: availErr } = await honSupabase
    .from('item_availability')
    .select('copies_total, active_loans, queue_length')
    .eq('item_id', itemId)
    .maybeSingle();
  if (availErr) throw availErr;

  const user = await honGetCurrentUser();

  let myLoan = null;
  let myQueueEntry = null;
  if (user) {
    const { data: loanRow } = await honSupabase
      .from('loans')
      .select('id, due_at')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .is('returned_at', null)
      .maybeSingle();
    myLoan = loanRow || null;

    const { data: queueRow } = await honSupabase
      .from('queue_entries')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle();
    myQueueEntry = queueRow || null;
  }

  const copiesTotal = avail?.copies_total ?? 1;
  const activeLoans = avail?.active_loans ?? 0;

  let status;
  if (myLoan) {
    status = 'checked_out_you';
  } else if (activeLoans >= copiesTotal) {
    status = 'checked_out_other';
  } else {
    status = 'available';
  }

  honState[itemId] = {
    status,
    dueDate: myLoan ? myLoan.due_at : null,
    loanId: myLoan ? myLoan.id : null,
    queueLen: avail?.queue_length ?? 0,
    youInQueue: !!myQueueEntry,
    copiesTotal,
  };
  return honState[itemId];
}

// Batched fetch for the whole catalog: 3 queries total (availability, own
// loans, own queue entries) instead of the old per-item N+1. Any item with
// no matching availability row still gets a safe default so a partial
// result doesn't break rendering.
async function honFetchAllStatuses(items) {
  const ids = items.map(i => i.id);

  try {
    const { data: availRows, error: availErr } = await honSupabase
      .from('item_availability')
      .select('item_id, copies_total, active_loans, queue_length')
      .in('item_id', ids);
    if (availErr) throw availErr;
    const availByItem = Object.fromEntries((availRows || []).map(r => [r.item_id, r]));

    const user = await honGetCurrentUser();

    let loansByItem = {};
    let queueByItem = {};
    if (user) {
      const [{ data: loanRows, error: loanErr }, { data: queueRows, error: queueErr }] = await Promise.all([
        honSupabase
          .from('loans')
          .select('id, item_id, due_at')
          .in('item_id', ids)
          .eq('user_id', user.id)
          .is('returned_at', null),
        honSupabase
          .from('queue_entries')
          .select('id, item_id')
          .in('item_id', ids)
          .eq('user_id', user.id),
      ]);
      if (loanErr) throw loanErr;
      if (queueErr) throw queueErr;
      loansByItem = Object.fromEntries((loanRows || []).map(r => [r.item_id, r]));
      queueByItem = Object.fromEntries((queueRows || []).map(r => [r.item_id, r]));
    }

    items.forEach(item => {
      const avail = availByItem[item.id];
      const myLoan = loansByItem[item.id] || null;
      const myQueueEntry = queueByItem[item.id] || null;
      const copiesTotal = avail?.copies_total ?? 1;
      const activeLoans = avail?.active_loans ?? 0;

      let status;
      if (myLoan) {
        status = 'checked_out_you';
      } else if (activeLoans >= copiesTotal) {
        status = 'checked_out_other';
      } else {
        status = 'available';
      }

      honState[item.id] = {
        status,
        dueDate: myLoan ? myLoan.due_at : null,
        loanId: myLoan ? myLoan.id : null,
        queueLen: avail?.queue_length ?? 0,
        youInQueue: !!myQueueEntry,
        copiesTotal,
      };
    });
  } catch (err) {
    console.error('Failed to fetch catalog statuses:', err);
    items.forEach(item => {
      if (!honState[item.id]) {
        honState[item.id] = {
          status: 'available', dueDate: null, loanId: null,
          queueLen: 0, youInQueue: false, copiesTotal: 1,
        };
      }
    });
  }
}

// ---- mutations ----
// Same (id, onChange) signature as the old localStorage version, so
// item.js's call sites barely change. onChange now receives an optional
// error argument (undefined on success) so callers that want to can
// distinguish success from failure; callers that ignore it still work.

async function honCheckOut(id, onChange) {
  try {
    const { error } = await honSupabase.rpc('check_out', { p_item_id: id });
    if (error) throw error;
    await honFetchStatus(id);
    if (onChange) onChange();
  } catch (err) {
    if (onChange) onChange(err);
  }
}

async function honReturnItem(id, onChange) {
  try {
    const loanId = honState[id]?.loanId;
    if (!loanId) throw new Error('no active loan to return');
    const { error } = await honSupabase.rpc('return_item', { p_loan_id: loanId });
    if (error) throw error;
    await honFetchStatus(id);
    if (onChange) onChange();
  } catch (err) {
    if (onChange) onChange(err);
  }
}

async function honJoinQueue(id, onChange) {
  try {
    const { error } = await honSupabase.rpc('join_queue', { p_item_id: id });
    if (error) throw error;
    await honFetchStatus(id);
    if (onChange) onChange();
  } catch (err) {
    if (onChange) onChange(err);
  }
}

async function honLeaveQueue(id, onChange) {
  try {
    const { error } = await honSupabase.rpc('leave_queue', { p_item_id: id });
    if (error) throw error;
    await honFetchStatus(id);
    if (onChange) onChange();
  } catch (err) {
    if (onChange) onChange(err);
  }
}

// True if the caller's own loan on this item is past its due date.
function honIsOverdue(s) {
  return s.status === 'checked_out_you' && !!s.dueDate && new Date(s.dueDate) < new Date();
}

// Returns { stampClass, stampLabel, metaText } for a given item's current
// state. Reads copiesTotal from honState (the live DB value, Finding 13).
function honStatusInfo(item) {
  const s = honState[item.id];
  if (!s) {
    return { stampClass: 'stamp-checked', stampLabel: 'LOADING…', metaText: '' };
  }
  if (s.status === 'available') {
    return { stampClass: 'stamp-available', stampLabel: 'ON THE SHELF', metaText: `${s.copiesTotal} ${s.copiesTotal > 1 ? 'copies' : 'copy'} in the collection` };
  }
  if (s.status === 'checked_out_you') {
    if (honIsOverdue(s)) {
      return { stampClass: 'stamp-overdue', stampLabel: 'OVERDUE', metaText: `Was due back ${honFormatDate(s.dueDate)} — please return it` };
    }
    return { stampClass: 'stamp-yours', stampLabel: 'CHECKED OUT · YOU', metaText: `Due back ${honFormatDate(s.dueDate)}` };
  }
  const posText = s.youInQueue ? `You’re #${s.queueLen} in line` : (s.queueLen > 0 ? `${s.queueLen} reader${s.queueLen > 1 ? 's' : ''} waiting` : 'No queue yet');
  return { stampClass: 'stamp-checked', stampLabel: 'CHECKED OUT', metaText: `${posText}` };
}

// Node/Vitest only (T15) — this branch never runs in a browser, where
// `module` is always undefined for a plain <script> tag. Lets the test
// suite `require()` these functions directly instead of needing to eval
// this file into a simulated global scope. honState/HON_CATALOG need
// getter/setter pairs rather than direct export because they're
// reassigned (not just mutated) inside this file — a plain exported
// reference would go stale the moment honFetchStatus or honFetchCatalog
// replaces it.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    honFetchCatalog, honFetchOneItem, honFormatDate, honEscape, honGetCurrentUser, honSignInWithEmail,
    honDeleteMyAccount,
    honFetchMyCards, honValidateCardCode, honRedeemCard,
    honStashPendingCardCode, honTakePendingCardCode,
    honFetchMyProfile, honAdminListProfiles, honAdminListLoans, honAdminListWaitlist,
    honAdminAcceptWaitlistRequest, honAdminDeclineWaitlistRequest,
    honFetchDengonban, honPostDengonban, honAdminListDengonban, honAdminHideDengonban,
    HON_DENGONBAN_COLORS, honGetOrCreateAnonToken,
    honAdminForceReturn, honAdminIssueCard, honAdminSetBanned, honAdminUpsertItem,
    honUploadCoverImage,
    honFetchMyNotifications, honMarkNotificationRead,
    honFetchStatus, honFetchAllStatuses,
    honCheckOut, honReturnItem, honJoinQueue, honLeaveQueue,
    honIsOverdue, honStatusInfo,
    getHonState: () => honState,
    setHonState: (s) => { honState = s; },
    getHonCatalog: () => HON_CATALOG,
    setHonCatalog: (c) => { HON_CATALOG = c; },
  };
}
