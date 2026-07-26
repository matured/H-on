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
  const stampColor = s.status === 'available' ? 'filled' : (s.status === 'checked_out_you' ? 'filled' : 'filled-red');
  const statusText = s.status === 'available' ? 'On the shelf' : (s.status === 'checked_out_you' ? 'Checked out — you' : 'Checked out');
  return `
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Genre: ${item.genre}</div>
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Era: ${item.era}</div>
    <div class="item-spec-row"><span class="item-spec-swatch filled"></span> Copies in collection: ${item.copies}</div>
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
    return `
      <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.12em;">${item.call}</span>
      <div style="text-align:center;">
        <div class="item-cover-title" style="font-size: clamp(38px, 6vw, 60px);">${item.era}</div>
        <div class="item-cover-sub">${item.genre}</div>
      </div>
      <span class="mono-tag" style="color:${item.coverAccent}; letter-spacing:0.1em;">${item.copies} ${item.copies > 1 ? 'copies' : 'copy'} held</span>
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

function honRenderItem() {
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
        <div class="mono-tag" id="item-meta" style="color:var(--grey); margin-top:14px;">${status.metaText}</div>

        <details class="item-disclosure">
          <summary>About This Demo</summary>
          <p class="item-disclosure-body">
            Checkout, queueing, and returns here are fully functional and saved to this browser only.
            This is a proof of concept of the mechanic, not a live multi-user system.
          </p>
        </details>
      </div>
    </div>
  `;

  bindItemActions(item);
  bindItemDots(item);
}

function bindItemActions(item) {
  const btn = document.getElementById('item-cta-btn');
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const rerender = () => {
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

document.addEventListener('DOMContentLoaded', () => {
  honBuildBackgroundPattern();
  honRenderItem();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(honBuildBackgroundPattern, 200);
  });
});
