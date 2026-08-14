/* ============================================
   本 (HON) — ITEM DETAIL PAGE
   Reads ?id= from the URL and renders the full
   record for one title, with live checkout controls
   and a repeating kanji wallpaper behind the layout.
   ============================================ */

function honGetItemFromURL() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return HON_CATALOG.find(i => i.id === id) || null;
}

function honBuildBackgroundPattern() {
  const bg = document.getElementById('item-bg-pattern');
  if (!bg) return;
  const cellTarget = 130;
  const cols = Math.ceil(window.innerWidth / cellTarget) + 1;
  const rows = Math.ceil(window.innerHeight / cellTarget) + 1;
  bg.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  bg.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  bg.innerHTML = '';
  for (let i = 0; i < cols * rows; i++) {
    const span = document.createElement('span');
    span.textContent = '本';
    bg.appendChild(span);
  }
}

function honCtaLabel(item) {
  const s = honState[item.id];
  if (s.status === 'available') return { label: 'Check Out', action: 'checkout', disabled: false };
  if (s.status === 'checked_out_you') return { label: 'Return Item', action: 'return', disabled: false };
  return s.youInQueue
    ? { label: 'Leave Queue', action: 'leave', disabled: false }
    : { label: 'Join Queue', action: 'join', disabled: false };
}

function honSpecRows(item) {
  const s = honState[item.id];
  const overdue = honIsOverdue(s);
  const stampColor = s.status === 'available' ? 'filled' : (s.status === 'checked_out_you' && !overdue ? 'filled' : 'filled-red');
  const statusText = s.status === 'available' ? 'On the shelf' : (s.status === 'checked_out_you' ? (overdue ? 'Checked out — you (overdue)' : 'Checked out — you') : 'Checked out');
  return `
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Genre: ${item.genre}</div>
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Era: ${item.era}</div>
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Copies in collection: ${s.copiesTotal}</div>
    <div class="item-spec-row"><span class="item-spec-swatch ${stampColor}"></span> Status: ${statusText}</div>
  `;
}

function honCoverInnerHTML(item, view) {
  if (item.coverImage) {
    const src = view === 'detail' ? (item.backImage || item.coverImage) : item.coverImage;
    const label = view === 'detail' ? 'Back cover' : `${item.title} ${item.issue}`;
    return `
      <img src="${src}" alt="${item.title} ${item.issue} — ${view === 'detail' ? 'back cover' : 'front cover'}" loading="lazy">
      <span class="mono-tag item-cover-photo-tag" style="background:${item.coverAccent}; color:${item.coverFg};">${label}</span>
    `;
  }
  if (view === 'detail') {
    const copiesTotal = honState[item.id]?.copiesTotal ?? 1;
    return `
      <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.12em;">${item.call}</span>
      <div style="text-align:center;">
        <div class="item-cover-title" style="font-size: clamp(38px, 6vw, 60px);">${item.era}</div>
        <div class="item-cover-sub">${item.genre}</div>
      </div>
      <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.1em;">${copiesTotal} ${copiesTotal > 1 ? 'copies' : 'copy'} held</span>
    `;
  }
  return `
    <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.12em;">${item.era}</span>
    <div>
      <div class="item-cover-title">${item.title}</div>
      ${item.subtitle ? `<div class="item-cover-sub">${item.subtitle}</div>` : ''}
    </div>
    <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.1em;">${item.issue}</span>
  `;
}

async function honRenderItem() {
  const item = honGetItemFromURL();
  const root = document.getElementById('item-root');

  if (!item) {
    root.innerHTML = `
      <p class="eyebrow">NOT FOUND</p>
      <h1 style="font-size: clamp(30px,5vw,50px); margin-top:14px;">This title isn't in the archive.</h1>
      <a href="catalog.html" class="btn" style="margin-top:22px; display:inline-flex;">Back to the Shelf &rarr;</a>
    `;
    document.title = 'Not Found · 本 (hon)';
    return;
  }

  root.innerHTML = `<p class="eyebrow">LOADING…</p>`;
  try {
    await honFetchStatus(item.id);
  } catch (err) {
    root.innerHTML = `
      <p class="eyebrow">SOMETHING WENT WRONG</p>
      <h1 style="font-size: clamp(26px,4vw,40px); margin-top:14px;">Couldn't load this item.</h1>
      <p class="serif-lede" style="margin-top:14px;">${err.message || err}</p>
      <a href="catalog.html" class="btn" style="margin-top:22px; display:inline-flex;">Back to the Shelf &rarr;</a>
    `;
    document.title = 'Error · 本 (hon)';
    return;
  }

  document.title = `${item.title} · 本 (hon)`;
  const cta = honCtaLabel(item);
  const status = honStatusInfo(item);

  root.innerHTML = `
    <a href="catalog.html" class="back-link">&larr; Back to the shelf</a>

    <div class="item-hero" style="margin-top: 28px;">
      <div class="item-media">
        <div class="item-cover-large${item.coverImage ? ' item-cover-large-photo' : ''}" id="item-cover" style="${item.coverImage ? `border-color:${item.coverAccent};` : `background:${item.coverBg}; color:${item.coverFg};`}">
          ${honCoverInnerHTML(item, 'cover')}
        </div>
        <div class="item-dots">
          <button class="item-dot active" data-view="cover" aria-label="Front cover"></button>
          <button class="item-dot" data-view="detail" aria-label="Back cover"></button>
        </div>
      </div>

      <div class="item-info">
        <div class="item-title-block">
          ${item.title}<span class="div-slash">/</span>${item.issue}<span class="div-slash">/</span>${item.genre}
        </div>
        <p class="item-subline">${item.call}</p>

        <p class="serif-lede" style="margin-top:22px; font-size:16px;">${item.desc}</p>

        <div class="item-spec-list" id="item-spec-list">${honSpecRows(item)}</div>

        <button class="item-cta" id="item-cta-btn" data-action="${cta.action}">${cta.label} &rarr;</button>
        <div class="mono-tag" id="item-action-error" style="color:var(--red); margin-top:10px; display:none;"></div>
        <div class="mono-tag" id="item-meta" style="color:var(--grey); margin-top:14px;">${status.metaText}</div>

        <details class="item-disclosure">
          <summary>About This Demo</summary>
          <p class="item-disclosure-body">
            Checkout, queueing, and returns here are real — backed by a shared database, not
            saved to your browser alone. Sign in from the Membership page to check something out.
          </p>
        </details>
      </div>
    </div>
  `;

  bindItemActions(item);
  bindItemDots(item);
}

const HON_ACTION_LOADING_LABEL = {
  checkout: 'Checking out…',
  return: 'Returning…',
  join: 'Joining queue…',
  leave: 'Leaving queue…',
};

function bindItemActions(item) {
  const btn = document.getElementById('item-cta-btn');
  const errorEl = document.getElementById('item-action-error');

  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    btn.disabled = true;
    btn.innerHTML = HON_ACTION_LOADING_LABEL[action] || '…';
    errorEl.style.display = 'none';
    errorEl.textContent = '';

    const rerender = (err) => {
      btn.disabled = false;
      if (err) {
        errorEl.textContent = honFriendlyError(err);
        errorEl.style.display = 'block';
        btn.innerHTML = `${honCtaLabel(item).label} &rarr;`;
        bindItemActions(item);
        return;
      }
      const cta = honCtaLabel(item);
      const status = honStatusInfo(item);
      btn.dataset.action = cta.action;
      btn.innerHTML = `${cta.label} &rarr;`;
      document.getElementById('item-meta').textContent = status.metaText;
      document.getElementById('item-spec-list').innerHTML = honSpecRows(item);
      bindItemActions(item);
    };
    if (action === 'checkout') honCheckOut(item.id, rerender);
    if (action === 'return') honReturnItem(item.id, rerender);
    if (action === 'join') honJoinQueue(item.id, rerender);
    if (action === 'leave') honLeaveQueue(item.id, rerender);
  }, { once: true });
}

function honFriendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('must be authenticated')) return "You'll need to sign in first — head to the Membership page.";
  if (msg.includes('no copies available')) return 'Someone just took the last copy. Try joining the queue instead.';
  if (msg.includes('overdue')) return "You have an overdue item — return it before checking out another.";
  if (msg.includes('already in queue')) return "You're already in the queue for this one.";
  return `Something went wrong: ${msg}`;
}

function bindItemDots(item) {
  const dots = document.querySelectorAll('.item-dot');
  const cover = document.getElementById('item-cover');
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      dots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      cover.innerHTML = honCoverInnerHTML(item, dot.dataset.view);
      if (!item.coverImage) {
        cover.style.textAlign = dot.dataset.view === 'detail' ? 'center' : '';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  honBuildBackgroundPattern();
  await honRenderItem();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(honBuildBackgroundPattern, 200);
  });
});
