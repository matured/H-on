import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockSupabase } from './helpers/mockSupabase.js';
import circ from '../js/circulation.js';

const {
  honFetchCatalog, honFormatDate, honGetCurrentUser, honSignInWithEmail,
  honFetchMyCards, honValidateCardCode, honRedeemCard,
  honStashPendingCardCode, honTakePendingCardCode,
  honFetchMyProfile, honAdminListProfiles, honAdminListLoans, honAdminListWaitlist,
  honAdminAcceptWaitlistRequest, honAdminDeclineWaitlistRequest,
  honFetchDengonban, honPostDengonban, honAdminListDengonban, honAdminHideDengonban,
  HON_DENGONBAN_COLORS, honGetOrCreateAnonToken,
  honAdminForceReturn, honAdminIssueCard, honAdminSetBanned, honAdminUpsertItem,
  honFetchMyNotifications, honMarkNotificationRead,
  honFetchStatus, honFetchAllStatuses,
  honCheckOut, honReturnItem, honJoinQueue, honLeaveQueue,
  honIsOverdue, honStatusInfo,
  getHonState, setHonState, getHonCatalog, setHonCatalog,
} = circ;

const USER = { id: 'user-1', email: 'reader@example.com' };

beforeEach(() => {
  setHonState({});
  setHonCatalog([]);
  localStorage.clear();
  delete global.honSupabase;
});

describe('honFormatDate', () => {
  it('formats as an uppercase MON DD, YYYY string', () => {
    const formatted = honFormatDate('2026-03-05T12:00:00Z');
    expect(formatted).toBe(formatted.toUpperCase());
    expect(formatted).toMatch(/^[A-Z]{3} \d{2}, 2026$/);
  });
  it('returns empty string for falsy input', () => {
    expect(honFormatDate(null)).toBe('');
    expect(honFormatDate(undefined)).toBe('');
    expect(honFormatDate('')).toBe('');
  });
});

describe('honIsOverdue', () => {
  it('is true for checked_out_you with a past due date', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(honIsOverdue({ status: 'checked_out_you', dueDate: past })).toBe(true);
  });
  it('is false for checked_out_you with a future due date', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(honIsOverdue({ status: 'checked_out_you', dueDate: future })).toBe(false);
  });
  it('is false for any other status, even with a past date', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(honIsOverdue({ status: 'checked_out_other', dueDate: past })).toBe(false);
    expect(honIsOverdue({ status: 'available', dueDate: null })).toBe(false);
  });
  it('is false with no dueDate at all', () => {
    expect(honIsOverdue({ status: 'checked_out_you', dueDate: null })).toBe(false);
  });
});

describe('honStatusInfo', () => {
  const item = { id: 'burst-vol15' };

  it('shows a loading state when nothing is cached yet', () => {
    expect(honStatusInfo(item).stampLabel).toBe('LOADING…');
  });

  it('shows available with plural copy count', () => {
    setHonState({ 'burst-vol15': { status: 'available', copiesTotal: 3, queueLen: 0, youInQueue: false } });
    const info = honStatusInfo(item);
    expect(info.stampClass).toBe('stamp-available');
    expect(info.metaText).toBe('3 copies in the collection');
  });

  it('uses singular "copy" for exactly 1', () => {
    setHonState({ 'burst-vol15': { status: 'available', copiesTotal: 1, queueLen: 0, youInQueue: false } });
    expect(honStatusInfo(item).metaText).toBe('1 copy in the collection');
  });

  it('shows checked-out-you with a due date when not overdue', () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    setHonState({ 'burst-vol15': { status: 'checked_out_you', dueDate: future, copiesTotal: 1 } });
    const info = honStatusInfo(item);
    expect(info.stampClass).toBe('stamp-yours');
    expect(info.stampLabel).toBe('CHECKED OUT · YOU');
    expect(info.metaText).toContain('Due back');
  });

  it('shows overdue instead of checked-out-you once past due', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    setHonState({ 'burst-vol15': { status: 'checked_out_you', dueDate: past, copiesTotal: 1 } });
    const info = honStatusInfo(item);
    expect(info.stampClass).toBe('stamp-overdue');
    expect(info.stampLabel).toBe('OVERDUE');
    expect(info.metaText).toContain('please return it');
  });

  it('shows queue position when the caller is in the queue', () => {
    setHonState({ 'burst-vol15': { status: 'checked_out_other', youInQueue: true, queueLen: 3, copiesTotal: 1 } });
    expect(honStatusInfo(item).metaText).toBe('You’re #3 in line');
  });

  it('shows plural reader count when others wait and caller is not queued', () => {
    setHonState({ 'burst-vol15': { status: 'checked_out_other', youInQueue: false, queueLen: 2, copiesTotal: 1 } });
    expect(honStatusInfo(item).metaText).toBe('2 readers waiting');
  });

  it('shows singular reader count for exactly one waiter', () => {
    setHonState({ 'burst-vol15': { status: 'checked_out_other', youInQueue: false, queueLen: 1, copiesTotal: 1 } });
    expect(honStatusInfo(item).metaText).toBe('1 reader waiting');
  });

  it('shows "no queue yet" when checked out with nobody waiting', () => {
    setHonState({ 'burst-vol15': { status: 'checked_out_other', youInQueue: false, queueLen: 0, copiesTotal: 1 } });
    expect(honStatusInfo(item).metaText).toBe('No queue yet');
  });
});

describe('honGetCurrentUser', () => {
  it('returns null when there is no session', async () => {
    global.honSupabase = createMockSupabase({ session: null });
    expect(await honGetCurrentUser()).toBeNull();
  });
  it('returns the session user when signed in', async () => {
    global.honSupabase = createMockSupabase({ session: { user: USER } });
    expect(await honGetCurrentUser()).toEqual(USER);
  });
});

describe('honSignInWithEmail', () => {
  it('throws when the auth call errors', async () => {
    global.honSupabase = { auth: { signInWithOtp: vi.fn(() => Promise.resolve({ error: new Error('boom') })) } };
    await expect(honSignInWithEmail('x@example.com')).rejects.toThrow('boom');
  });
  it('resolves without throwing on success', async () => {
    global.honSupabase = { auth: { signInWithOtp: vi.fn(() => Promise.resolve({ error: null })) } };
    await expect(honSignInWithEmail('x@example.com')).resolves.toBeUndefined();
  });
});

describe('honFetchStatus', () => {
  it('is available when signed out with no active loans', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: { copies_total: 1, active_loans: 0, queue_length: 0 }, error: null } },
    });
    const status = await honFetchStatus('burst-vol15');
    expect(status.status).toBe('available');
    expect(status.copiesTotal).toBe(1);
  });

  it('is checked_out_other when signed out and copies are exhausted', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: { copies_total: 1, active_loans: 1, queue_length: 2 }, error: null } },
    });
    const status = await honFetchStatus('burst-vol15');
    expect(status.status).toBe('checked_out_other');
    expect(status.queueLen).toBe(2);
  });

  it('is checked_out_you when the caller holds an active loan, even if capacity looks free', async () => {
    global.honSupabase = createMockSupabase({
      session: { user: USER },
      responses: {
        item_availability: { data: { copies_total: 1, active_loans: 1, queue_length: 0 }, error: null },
        loans: { data: { id: 'loan-1', due_at: '2026-04-01T00:00:00Z' }, error: null },
        queue_entries: { data: null, error: null },
      },
    });
    const status = await honFetchStatus('burst-vol15');
    expect(status.status).toBe('checked_out_you');
    expect(status.loanId).toBe('loan-1');
    expect(status.dueDate).toBe('2026-04-01T00:00:00Z');
  });

  it('reflects youInQueue when the caller has a queue entry but no loan', async () => {
    global.honSupabase = createMockSupabase({
      session: { user: USER },
      responses: {
        item_availability: { data: { copies_total: 1, active_loans: 1, queue_length: 1 }, error: null },
        loans: { data: null, error: null },
        queue_entries: { data: { id: 'q-1' }, error: null },
      },
    });
    const status = await honFetchStatus('burst-vol15');
    expect(status.status).toBe('checked_out_other');
    expect(status.youInQueue).toBe(true);
  });

  it('defaults to 1 copy / available when the item has no availability row', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: null, error: null } },
    });
    const status = await honFetchStatus('unknown-item');
    expect(status).toEqual({
      status: 'available', dueDate: null, loanId: null, queueLen: 0, youInQueue: false, copiesTotal: 1,
    });
  });

  it('throws on an availability query error and does not cache anything', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: null, error: new Error('db down') } },
    });
    await expect(honFetchStatus('burst-vol15')).rejects.toThrow('db down');
    expect(getHonState()['burst-vol15']).toBeUndefined();
  });

  it('caches the result in honState under the item id', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: { copies_total: 2, active_loans: 0, queue_length: 0 }, error: null } },
    });
    await honFetchStatus('burst-vol15');
    expect(getHonState()['burst-vol15'].copiesTotal).toBe(2);
  });
});

describe('honFetchAllStatuses', () => {
  const items = [{ id: 'a' }, { id: 'b' }];

  it('batches availability for every item in one query when signed out', async () => {
    global.honSupabase = createMockSupabase({
      session: null,
      responses: {
        item_availability: {
          data: [
            { item_id: 'a', copies_total: 1, active_loans: 0, queue_length: 0 },
            { item_id: 'b', copies_total: 1, active_loans: 1, queue_length: 0 },
          ],
          error: null,
        },
      },
    });
    await honFetchAllStatuses(items);
    expect(global.honSupabase.from).toHaveBeenCalledWith('item_availability');
    // Signed out: loans/queue_entries should never be queried at all.
    expect(global.honSupabase.from).not.toHaveBeenCalledWith('loans');
    expect(global.honSupabase.from).not.toHaveBeenCalledWith('queue_entries');
    expect(getHonState().a.status).toBe('available');
    expect(getHonState().b.status).toBe('checked_out_other');
  });

  it('marks the caller\'s own held item as checked_out_you when signed in', async () => {
    global.honSupabase = createMockSupabase({
      session: { user: USER },
      responses: {
        item_availability: {
          data: [{ item_id: 'a', copies_total: 1, active_loans: 1, queue_length: 0 }],
          error: null,
        },
        loans: { data: [{ id: 'loan-1', item_id: 'a', due_at: '2026-04-01T00:00:00Z' }], error: null },
        queue_entries: { data: [], error: null },
      },
    });
    await honFetchAllStatuses([{ id: 'a' }]);
    expect(getHonState().a.status).toBe('checked_out_you');
    expect(getHonState().a.loanId).toBe('loan-1');
  });

  it('falls back to a safe default for items with no prior state on a query error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: null, error: new Error('db down') } },
    });
    await honFetchAllStatuses(items);
    expect(getHonState().a).toEqual({ status: 'available', dueDate: null, loanId: null, queueLen: 0, youInQueue: false, copiesTotal: 1 });
    expect(getHonState().b).toEqual(getHonState().a);
    consoleSpy.mockRestore();
  });

  it('preserves existing cached state for an item on error instead of overwriting it', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setHonState({ a: { status: 'checked_out_you', dueDate: '2026-04-01T00:00:00Z', loanId: 'loan-1', queueLen: 0, youInQueue: false, copiesTotal: 1 } });
    global.honSupabase = createMockSupabase({
      session: null,
      responses: { item_availability: { data: null, error: new Error('db down') } },
    });
    await honFetchAllStatuses(items);
    expect(getHonState().a.status).toBe('checked_out_you'); // untouched
    expect(getHonState().b.status).toBe('available'); // got the fallback default
    consoleSpy.mockRestore();
  });
});

describe('honCheckOut / honReturnItem / honJoinQueue / honLeaveQueue', () => {
  const freshStatusMock = () => createMockSupabase({
    session: null,
    responses: { item_availability: { data: { copies_total: 1, active_loans: 1, queue_length: 0 }, error: null } },
  });

  it('honCheckOut calls onChange with no error and refreshes status on success', async () => {
    const mock = freshStatusMock();
    mock.rpc = vi.fn(() => Promise.resolve({ error: null }));
    global.honSupabase = mock;
    const onChange = vi.fn();
    await honCheckOut('burst-vol15', onChange);
    expect(mock.rpc).toHaveBeenCalledWith('check_out', { p_item_id: 'burst-vol15' });
    expect(onChange).toHaveBeenCalledWith();
    expect(getHonState()['burst-vol15']).toBeDefined();
  });

  it('honCheckOut calls onChange with the error on failure, without touching honState', async () => {
    global.honSupabase = { rpc: vi.fn(() => Promise.resolve({ error: new Error('no copies available') })) };
    const onChange = vi.fn();
    await honCheckOut('burst-vol15', onChange);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ message: 'no copies available' }));
    expect(getHonState()['burst-vol15']).toBeUndefined();
  });

  it('honCheckOut works with no onChange callback at all', async () => {
    global.honSupabase = { rpc: vi.fn(() => Promise.resolve({ error: new Error('boom') })) };
    await expect(honCheckOut('burst-vol15')).resolves.toBeUndefined();
  });

  it('honReturnItem refuses to call the RPC when there is no cached loan id', async () => {
    global.honSupabase = { rpc: vi.fn() };
    const onChange = vi.fn();
    await honReturnItem('burst-vol15', onChange);
    expect(global.honSupabase.rpc).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ message: 'no active loan to return' }));
  });

  it('honReturnItem calls return_item with the cached loan id and refreshes on success', async () => {
    setHonState({ 'burst-vol15': { status: 'checked_out_you', loanId: 'loan-1', dueDate: null, queueLen: 0, youInQueue: false, copiesTotal: 1 } });
    const mock = freshStatusMock();
    mock.rpc = vi.fn(() => Promise.resolve({ error: null }));
    global.honSupabase = mock;
    const onChange = vi.fn();
    await honReturnItem('burst-vol15', onChange);
    expect(mock.rpc).toHaveBeenCalledWith('return_item', { p_loan_id: 'loan-1' });
    expect(onChange).toHaveBeenCalledWith();
  });

  it('honJoinQueue calls join_queue and reports errors via onChange', async () => {
    global.honSupabase = { rpc: vi.fn(() => Promise.resolve({ error: new Error('already in queue for this item') })) };
    const onChange = vi.fn();
    await honJoinQueue('burst-vol15', onChange);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('join_queue', { p_item_id: 'burst-vol15' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ message: 'already in queue for this item' }));
  });

  it('honLeaveQueue calls leave_queue and refreshes status on success', async () => {
    const mock = freshStatusMock();
    mock.rpc = vi.fn(() => Promise.resolve({ error: null }));
    global.honSupabase = mock;
    const onChange = vi.fn();
    await honLeaveQueue('burst-vol15', onChange);
    expect(mock.rpc).toHaveBeenCalledWith('leave_queue', { p_item_id: 'burst-vol15' });
    expect(onChange).toHaveBeenCalledWith();
  });
});

describe('honFetchCatalog', () => {
  it('maps DB rows to the HON_CATALOG shape, dropping nullish optional fields to undefined', async () => {
    global.honSupabase = createMockSupabase({
      responses: {
        items: {
          data: [{
            item_id: 'burst-vol15', title: 'BURST', subtitle: null, issue: 'Vol.15',
            era: '1998', genre: 'Tattoo & Subculture', call_number: '本 · TS · 98-015',
            copies_total: 1, cover_bg: '#000', cover_fg: '#fff', cover_accent: '#f00',
            cover_image: null, back_image: null, description: 'desc',
          }],
          error: null,
        },
      },
    });
    const catalog = await honFetchCatalog();
    expect(catalog).toEqual([{
      id: 'burst-vol15', title: 'BURST', subtitle: undefined, issue: 'Vol.15',
      era: '1998', genre: 'Tattoo & Subculture', call: '本 · TS · 98-015',
      copiesTotal: 1, coverBg: '#000', coverFg: '#fff', coverAccent: '#f00',
      coverImage: undefined, backImage: undefined, desc: 'desc',
    }]);
    expect(getHonCatalog()).toEqual(catalog);
  });

  it('throws on a query error', async () => {
    global.honSupabase = createMockSupabase({ responses: { items: { data: null, error: new Error('db down') } } });
    await expect(honFetchCatalog()).rejects.toThrow('db down');
  });
});

describe('honFetchMyCards / honFetchMyProfile / honFetchMyNotifications (signed-out gate)', () => {
  it('honFetchMyCards returns null when signed out, without querying', async () => {
    global.honSupabase = createMockSupabase({ session: null });
    expect(await honFetchMyCards()).toBeNull();
    expect(global.honSupabase.from).not.toHaveBeenCalled();
  });
  it('honFetchMyCards returns the caller\'s cards when signed in', async () => {
    const cards = [{ id: 'c1', code: 'abc', issued_at: '2026-01-01', claimed_at: null }];
    global.honSupabase = createMockSupabase({ session: { user: USER }, responses: { library_cards: { data: cards, error: null } } });
    expect(await honFetchMyCards()).toEqual(cards);
  });

  it('honFetchMyProfile returns null when signed out, without querying', async () => {
    global.honSupabase = createMockSupabase({ session: null });
    expect(await honFetchMyProfile()).toBeNull();
    expect(global.honSupabase.from).not.toHaveBeenCalled();
  });
  it('honFetchMyProfile returns the caller\'s profile when signed in', async () => {
    const profile = { user_id: USER.id, is_admin: true, banned: false };
    global.honSupabase = createMockSupabase({ session: { user: USER }, responses: { profiles: { data: profile, error: null } } });
    expect(await honFetchMyProfile()).toEqual(profile);
  });

  it('honFetchMyNotifications returns [] when signed out, without querying', async () => {
    global.honSupabase = createMockSupabase({ session: null });
    expect(await honFetchMyNotifications()).toEqual([]);
    expect(global.honSupabase.from).not.toHaveBeenCalled();
  });
  it('honFetchMyNotifications returns unread notifications when signed in', async () => {
    const notifs = [{ id: 'n1', item_id: 'burst-vol15', created_at: '2026-01-01' }];
    global.honSupabase = createMockSupabase({ session: { user: USER }, responses: { notifications: { data: notifs, error: null } } });
    expect(await honFetchMyNotifications()).toEqual(notifs);
  });
});

describe('honValidateCardCode / honRedeemCard / honMarkNotificationRead', () => {
  it('honValidateCardCode returns true/false from the RPC result', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { validate_card_code: { data: true, error: null } } });
    expect(await honValidateCardCode('code')).toBe(true);
    global.honSupabase = createMockSupabase({ rpcResponses: { validate_card_code: { data: false, error: null } } });
    expect(await honValidateCardCode('code')).toBe(false);
  });
  it('honValidateCardCode throws on RPC error', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { validate_card_code: { data: null, error: new Error('nope') } } });
    await expect(honValidateCardCode('code')).rejects.toThrow('nope');
  });

  it('honRedeemCard resolves on success and throws on failure', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { redeem_card: { error: null } } });
    await expect(honRedeemCard('code')).resolves.toBeUndefined();
    global.honSupabase = createMockSupabase({ rpcResponses: { redeem_card: { error: new Error('card code invalid or already claimed') } } });
    await expect(honRedeemCard('code')).rejects.toThrow('card code invalid or already claimed');
  });

  it('honMarkNotificationRead calls the RPC with the notification id and throws on error', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { mark_notification_read: { error: null } } });
    await honMarkNotificationRead('n1');
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
    global.honSupabase = createMockSupabase({ rpcResponses: { mark_notification_read: { error: new Error('not yours') } } });
    await expect(honMarkNotificationRead('n1')).rejects.toThrow('not yours');
  });
});

describe('pending card code (localStorage round trip)', () => {
  it('stashes and takes a code, clearing it after take', () => {
    honStashPendingCardCode('abc123');
    expect(honTakePendingCardCode()).toBe('abc123');
    expect(honTakePendingCardCode()).toBeNull();
  });
});

describe('admin wrappers', () => {
  it('honAdminForceReturn calls admin_force_return with the loan id', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_force_return: { error: null } } });
    await honAdminForceReturn('loan-1');
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_force_return', { p_loan_id: 'loan-1' });
  });

  it('honAdminSetBanned calls admin_set_banned with the user id and flag', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_set_banned: { error: null } } });
    await honAdminSetBanned('user-2', true);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_set_banned', { p_user_id: 'user-2', p_banned: true });
  });

  it('honAdminUpsertItem maps the HON_CATALOG item shape to the RPC\'s p_* param names', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_upsert_item: { data: { item_id: 'x' }, error: null } } });
    await honAdminUpsertItem({
      id: 'x', title: 'T', subtitle: undefined, issue: 'No.1', era: '2026', genre: 'G',
      call: 'CALL', copiesTotal: 2, coverBg: '#000', coverFg: '#fff', coverAccent: '#f00',
      coverImage: undefined, backImage: undefined, desc: 'D',
    });
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_upsert_item', {
      p_item_id: 'x', p_title: 'T', p_subtitle: null, p_issue: 'No.1', p_era: '2026', p_genre: 'G',
      p_call_number: 'CALL', p_copies_total: 2, p_cover_bg: '#000', p_cover_fg: '#fff', p_cover_accent: '#f00',
      p_cover_image: null, p_back_image: null, p_description: 'D',
    });
  });

  it('honAdminIssueCard / honAdminListProfiles / honAdminListLoans propagate RPC errors', async () => {
    global.honSupabase = createMockSupabase({
      rpcResponses: {
        admin_issue_card: { data: null, error: new Error('admin only') },
        admin_list_profiles: { data: null, error: new Error('admin only') },
        admin_list_loans: { data: null, error: new Error('admin only') },
      },
    });
    await expect(honAdminIssueCard()).rejects.toThrow('admin only');
    await expect(honAdminListProfiles()).rejects.toThrow('admin only');
    await expect(honAdminListLoans()).rejects.toThrow('admin only');
  });

  it('honAdminListProfiles / honAdminListLoans default to [] instead of null', async () => {
    global.honSupabase = createMockSupabase({
      rpcResponses: {
        admin_list_profiles: { data: null, error: null },
        admin_list_loans: { data: null, error: null },
      },
    });
    expect(await honAdminListProfiles()).toEqual([]);
    expect(await honAdminListLoans()).toEqual([]);
  });

  it('honAdminListWaitlist calls admin_list_waitlist and returns the rows on success', async () => {
    const rows = [{ id: 1, name: 'Jane', email: 'jane@example.com', note: 'hi', created_at: '2026-01-01T00:00:00Z' }];
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_waitlist: { data: rows, error: null } } });
    expect(await honAdminListWaitlist()).toEqual(rows);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_list_waitlist');
  });

  it('honAdminListWaitlist defaults to [] instead of null', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_waitlist: { data: null, error: null } } });
    expect(await honAdminListWaitlist()).toEqual([]);
  });

  it('honAdminListWaitlist throws on RPC error (e.g. a non-admin caller)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_waitlist: { data: null, error: new Error('admin only') } } });
    await expect(honAdminListWaitlist()).rejects.toThrow('admin only');
  });

  it('honAdminAcceptWaitlistRequest calls admin_accept_waitlist_request with p_request_id and returns the minted card', async () => {
    const card = { id: 'card-1', code: 'ABCD-1234' };
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_accept_waitlist_request: { data: card, error: null } } });
    expect(await honAdminAcceptWaitlistRequest(9)).toEqual(card);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_accept_waitlist_request', { p_request_id: 9 });
  });

  // Covers the migration's row-lock guard from the JS side: a second
  // accept on an already-handled request comes back as an RPC error (the
  // RPC's own "request not found or already handled" exception), and the
  // wrapper must propagate it rather than resolving with undefined/null,
  // which is what admin.html's catch block relies on to show the retry state.
  it('honAdminAcceptWaitlistRequest throws on RPC error (e.g. double-accept)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_accept_waitlist_request: { data: null, error: new Error('request not found or already handled') } } });
    await expect(honAdminAcceptWaitlistRequest(9)).rejects.toThrow('request not found or already handled');
  });

  // Distinct from the "already handled" case above — this is the RPC's
  // own is_admin() gate, the same "admin only" every other admin_* RPC
  // raises for a non-admin caller (see the honAdminIssueCard test above).
  it('honAdminAcceptWaitlistRequest throws on RPC error (e.g. a non-admin caller)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_accept_waitlist_request: { data: null, error: new Error('admin only') } } });
    await expect(honAdminAcceptWaitlistRequest(9)).rejects.toThrow('admin only');
  });

  it('honAdminDeclineWaitlistRequest calls admin_decline_waitlist_request with p_request_id', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_decline_waitlist_request: { data: null, error: null } } });
    await honAdminDeclineWaitlistRequest(9);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_decline_waitlist_request', { p_request_id: 9 });
  });

  it('honFetchDengonban reads dengonban_messages and returns the rows on success', async () => {
    const rows = [{ id: 'm1', body: 'hello', created_at: '2026-01-01T00:00:00Z', color: '#fef3c7', pos_x: 50, pos_y: 50, doodle: null }];
    global.honSupabase = createMockSupabase({ responses: { dengonban_messages: { data: rows, error: null } } });
    expect(await honFetchDengonban()).toEqual(rows);
  });

  it('honFetchDengonban defaults to [] instead of null', async () => {
    global.honSupabase = createMockSupabase({ responses: { dengonban_messages: { data: null, error: null } } });
    expect(await honFetchDengonban()).toEqual([]);
  });

  it('honFetchDengonban throws on read error', async () => {
    global.honSupabase = createMockSupabase({ responses: { dengonban_messages: { data: null, error: new Error('network error') } } });
    await expect(honFetchDengonban()).rejects.toThrow('network error');
  });

  it('honPostDengonban calls post_dengonban_message with p_anon_token: null when signed in', async () => {
    const msg = { id: 'm1', body: 'hello', created_at: '2026-01-01T00:00:00Z', color: '#fef3c7', pos_x: 12, pos_y: 34, doodle: null };
    global.honSupabase = createMockSupabase({ session: { user: USER }, rpcResponses: { post_dengonban_message: { data: msg, error: null } } });
    expect(await honPostDengonban('hello', { color: '#fef3c7', x: 12, y: 34 })).toEqual(msg);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('post_dengonban_message', {
      p_body: 'hello', p_color: '#fef3c7', p_pos_x: 12, p_pos_y: 34, p_doodle: null, p_anon_token: null,
    });
  });

  // Signed-out posters have no account to key a rate limit on, so the RPC
  // takes a client-generated token instead — the wrapper is responsible
  // for reading/creating it via honGetOrCreateAnonToken() and passing it
  // as p_anon_token exactly when there's no session.
  it('honPostDengonban passes an anon token as p_anon_token when signed out', async () => {
    const msg = { id: 'm2', body: 'hi', created_at: '2026-01-01T00:00:00Z', color: '#bfdbfe', pos_x: 5, pos_y: 95, doodle: null };
    global.honSupabase = createMockSupabase({ session: null, rpcResponses: { post_dengonban_message: { data: msg, error: null } } });
    await honPostDengonban('hi', { color: '#bfdbfe', x: 5, y: 95 });
    const token = honGetOrCreateAnonToken();
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('post_dengonban_message', {
      p_body: 'hi', p_color: '#bfdbfe', p_pos_x: 5, p_pos_y: 95, p_doodle: null, p_anon_token: token,
    });
  });

  it('honPostDengonban passes doodle strokes through as p_doodle', async () => {
    const strokes = [[[1, 2], [3, 4]]];
    global.honSupabase = createMockSupabase({ session: { user: USER }, rpcResponses: { post_dengonban_message: { data: {}, error: null } } });
    await honPostDengonban('hello', { color: '#fef3c7', x: 50, y: 50, doodle: strokes });
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('post_dengonban_message', expect.objectContaining({ p_doodle: strokes }));
  });

  // Covers the RPC's rate limit (member or anon), its banned-account
  // check, and its color/position validation — all raise as plain RPC
  // errors the wrapper must propagate, same pattern as every other
  // rate-limited/validated RPC (T14).
  it('honPostDengonban throws on RPC error (e.g. rate limit exceeded)', async () => {
    global.honSupabase = createMockSupabase({ session: { user: USER }, rpcResponses: { post_dengonban_message: { data: null, error: new Error('rate limit exceeded for post_dengonban_message, try again shortly') } } });
    await expect(honPostDengonban('hello', { color: '#fef3c7', x: 50, y: 50 })).rejects.toThrow('rate limit exceeded');
  });

  it('honPostDengonban throws on RPC error (e.g. anon rate limit exceeded)', async () => {
    global.honSupabase = createMockSupabase({ session: null, rpcResponses: { post_dengonban_message: { data: null, error: new Error('rate limit exceeded for anonymous posting, try again shortly') } } });
    await expect(honPostDengonban('hello', { color: '#fef3c7', x: 50, y: 50 })).rejects.toThrow('rate limit exceeded for anonymous posting');
  });

  it('honPostDengonban throws on RPC error (e.g. invalid note color)', async () => {
    global.honSupabase = createMockSupabase({ session: { user: USER }, rpcResponses: { post_dengonban_message: { data: null, error: new Error('invalid note color') } } });
    await expect(honPostDengonban('hello', { color: '#000000', x: 50, y: 50 })).rejects.toThrow('invalid note color');
  });

  it('honGetOrCreateAnonToken generates and persists a token on first call', () => {
    expect(localStorage.getItem('hon_dengonban_anon_token')).toBeNull();
    const token = honGetOrCreateAnonToken();
    expect(token).toBeTruthy();
    expect(localStorage.getItem('hon_dengonban_anon_token')).toBe(token);
  });

  it('honGetOrCreateAnonToken returns the same token on a later call', () => {
    const first = honGetOrCreateAnonToken();
    const second = honGetOrCreateAnonToken();
    expect(second).toBe(first);
  });

  it('honAdminListDengonban calls admin_list_dengonban and returns the rows on success', async () => {
    const rows = [{ id: 'm1', user_email: 'jane@example.com', body: 'hi', created_at: '2026-01-01T00:00:00Z', expires_at: '2026-01-31T00:00:00Z', hidden: false, color: '#fef3c7', pos_x: 50, pos_y: 50, doodle_present: false }];
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_dengonban: { data: rows, error: null } } });
    expect(await honAdminListDengonban()).toEqual(rows);
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_list_dengonban');
  });

  it('honAdminListDengonban defaults to [] instead of null', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_dengonban: { data: null, error: null } } });
    expect(await honAdminListDengonban()).toEqual([]);
  });

  it('honAdminListDengonban throws on RPC error (e.g. a non-admin caller)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_list_dengonban: { data: null, error: new Error('admin only') } } });
    await expect(honAdminListDengonban()).rejects.toThrow('admin only');
  });

  it('honAdminHideDengonban calls admin_hide_dengonban_message with p_id', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_hide_dengonban_message: { data: null, error: null } } });
    await honAdminHideDengonban('m1');
    expect(global.honSupabase.rpc).toHaveBeenCalledWith('admin_hide_dengonban_message', { p_id: 'm1' });
  });

  it('honAdminHideDengonban throws on RPC error (e.g. a non-admin caller)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_hide_dengonban_message: { data: null, error: new Error('admin only') } } });
    await expect(honAdminHideDengonban('m1')).rejects.toThrow('admin only');
  });

  it('honAdminDeclineWaitlistRequest throws on RPC error (e.g. double-decline)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_decline_waitlist_request: { data: null, error: new Error('request not found or already handled') } } });
    await expect(honAdminDeclineWaitlistRequest(9)).rejects.toThrow('request not found or already handled');
  });

  it('honAdminDeclineWaitlistRequest throws on RPC error (e.g. a non-admin caller)', async () => {
    global.honSupabase = createMockSupabase({ rpcResponses: { admin_decline_waitlist_request: { data: null, error: new Error('admin only') } } });
    await expect(honAdminDeclineWaitlistRequest(9)).rejects.toThrow('admin only');
  });
});
