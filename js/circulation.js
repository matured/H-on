/* ============================================
   本 (HON) — CIRCULATION STATE (shared)
   Checkout / return / queue logic used by both
   the Archive browse page and individual item pages.
   State persists to this browser via localStorage.
   ============================================ */

const HON_STORAGE_KEY = 'hon_circulation_state_v2';

const HON_SEEDED_CHECKED_OUT = {
  'burst-vol17': { queueLen: 2 },
  'lightning-vol367': { queueLen: 1 },
  'fruits-no92': { queueLen: 3 },
  'lightning-vol378': { queueLen: 0 },
};

function honAddDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function honFormatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
}

function honDefaultEntry(id) {
  if (HON_SEEDED_CHECKED_OUT[id]) {
    return {
      status: 'checked_out_other',
      dueDate: honAddDays(new Date(), 6 + Math.floor(Math.random() * 5)),
      queueLen: HON_SEEDED_CHECKED_OUT[id].queueLen,
      youInQueue: false,
    };
  }
  return { status: 'available', dueDate: null, queueLen: 0, youInQueue: false };
}

function honLoadState() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(HON_STORAGE_KEY)); } catch (e) { raw = null; }

  const state = raw || {};
  let changed = !raw;

  // Self-heal: if the catalog has changed (items added, removed, or this
  // is a fresh browser), make sure every current catalog item has a state
  // entry so lookups never fail, and drop entries for items no longer in
  // the catalog.
  HON_CATALOG.forEach(item => {
    if (!state[item.id]) {
      state[item.id] = honDefaultEntry(item.id);
      changed = true;
    }
  });
  const validIds = new Set(HON_CATALOG.map(i => i.id));
  Object.keys(state).forEach(id => {
    if (!validIds.has(id)) {
      delete state[id];
      changed = true;
    }
  });

  if (changed) honSaveState(state);
  return state;
}

function honSaveState(state) {
  localStorage.setItem(HON_STORAGE_KEY, JSON.stringify(state));
}

let honState = honLoadState();

function honCheckOut(id, onChange) {
  honState[id] = {
    status: 'checked_out_you',
    dueDate: honAddDays(new Date(), 14),
    queueLen: 0,
    youInQueue: false,
  };
  honSaveState(honState);
  if (onChange) onChange();
}

function honReturnItem(id, onChange) {
  honState[id] = { status: 'available', dueDate: null, queueLen: 0, youInQueue: false };
  honSaveState(honState);
  if (onChange) onChange();
}

function honJoinQueue(id, onChange) {
  honState[id].youInQueue = true;
  honState[id].queueLen += 1;
  honSaveState(honState);
  if (onChange) onChange();
}

function honLeaveQueue(id, onChange) {
  honState[id].youInQueue = false;
  honState[id].queueLen = Math.max(0, honState[id].queueLen - 1);
  honSaveState(honState);
  if (onChange) onChange();
}

// Returns { stampClass, stampLabel, metaText } for a given item's current state
function honStatusInfo(item) {
  const s = honState[item.id];
  if (s.status === 'available') {
    return { stampClass: 'stamp-available', stampLabel: 'ON THE SHELF', metaText: `${item.copies} ${item.copies > 1 ? 'copies' : 'copy'} in the collection` };
  }
  if (s.status === 'checked_out_you') {
    return { stampClass: 'stamp-yours', stampLabel: 'CHECKED OUT · YOU', metaText: `Due back ${honFormatDate(s.dueDate)}` };
  }
  const posText = s.youInQueue ? `You're #${s.queueLen} in line` : (s.queueLen > 0 ? `${s.queueLen} reader${s.queueLen > 1 ? 's' : ''} waiting` : 'No queue yet');
  return { stampClass: 'stamp-checked', stampLabel: 'CHECKED OUT', metaText: `Back ${honFormatDate(s.dueDate)} · ${posText}` };
}
