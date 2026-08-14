/* ============================================
   本 (HON) — CIRCULATION STATE (shared)
   Checkout / return / queue logic used by both
   the Archive browse page and individual item pages.
   State lives in Supabase now — see supabase/migrations/.
   honState is an in-memory cache, populated by fetching
   from the server, not the source of truth itself.
   ============================================ */

let honState = {};

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
// state. Reads copiesTotal from honState (the live DB value, Finding 13),
// never from the static catalog-data.js copies field.
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
  const posText = s.youInQueue ? `You're #${s.queueLen} in line` : (s.queueLen > 0 ? `${s.queueLen} reader${s.queueLen > 1 ? 's' : ''} waiting` : 'No queue yet');
  return { stampClass: 'stamp-checked', stampLabel: 'CHECKED OUT', metaText: `${posText}` };
}
