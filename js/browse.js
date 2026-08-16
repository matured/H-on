/* ============================================
   本 (HON) — ARCHIVE BROWSE (scattered shelf)
   Items float at varied positions and sizes down
   a tall vertical canvas. Hover scales the cover
   up; clicking opens the item's own page.
   ============================================ */

function honSeeded(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function honCoverHTML(item) {
  const bg = honEscape(item.coverBg), fg = honEscape(item.coverFg), accent = honEscape(item.coverAccent);
  const title = honEscape(item.title), issue = honEscape(item.issue), era = honEscape(item.era);
  if (item.coverImage) {
    return `
      <div class="shelf-cover shelf-cover-photo" style="border-color:${accent};">
        <img src="${honEscape(item.coverImage)}" alt="${title} ${issue} cover" loading="lazy">
        <span class="shelf-cover-photo-tag mono-tag" style="background:${accent}; color:${fg};">${era}</span>
      </div>
    `;
  }
  return `
    <div class="shelf-cover" style="background:${bg}; color:${fg};">
      <span class="shelf-cover-era mono-tag" style="color:${accent}">${era}</span>
      <span class="shelf-cover-title">${title}</span>
      ${item.subtitle ? `<span class="shelf-cover-sub">${honEscape(item.subtitle)}</span>` : ''}
      <span class="shelf-cover-issue mono-tag" style="color:${accent}">${issue}</span>
    </div>
  `;
}

function honLayoutShelf(visibleItems) {
  const shelf = document.getElementById('shelf');
  if (!shelf) return;

  const isMobile = window.innerWidth <= 760;
  shelf.innerHTML = '';

  const sideTop = [20, 20];

  visibleItems.forEach((item) => {
    const globalIndex = HON_CATALOG.findIndex(x => x.id === item.id);
    const side = globalIndex % 2 === 0 ? 0 : 1;
    const jitter = honSeeded(globalIndex * 3 + 1) * 12;
    const widthPct = 20 + honSeeded(globalIndex * 7 + 2) * 8; // 20–28%
    const leftPct = side === 0 ? 4 + jitter * 0.5 : 50 + jitter;
    const rotate = (honSeeded(globalIndex * 11 + 4) - 0.5) * 5;

    const el = document.createElement('a');
    el.href = `item.html?id=${item.id}`;
    el.className = 'shelf-item';
    el.dataset.genre = item.genre;
    el.style.width = widthPct + '%';
    el.style.transform = `rotate(${rotate.toFixed(1)}deg)`;

    if (!isMobile) {
      el.style.top = sideTop[side] + 'px';
      el.style.left = leftPct + '%';
    }

    const status = honStatusInfo(item);
    const statusColor = status.stampClass === 'stamp-available' ? '#1c6b3f' : status.stampClass === 'stamp-yours' ? '#1a4fa0' : '#c8102e';
    el.innerHTML = `
      ${honCoverHTML(item)}
      <div class="shelf-caption">
        <div class="shelf-caption-title mono-tag">${honEscape(item.call)}</div>
        <div class="shelf-caption-status" style="color:${statusColor}">${honEscape(status.stampLabel)}</div>
      </div>
    `;

    shelf.appendChild(el);

    const approxWidthPx = (widthPct / 100) * shelf.clientWidth;
    const approxHeight = approxWidthPx * 1.33 + 60;
    sideTop[side] += approxHeight + 70 + honSeeded(globalIndex * 5 + 3) * 60;
  });

  shelf.style.height = isMobile ? 'auto' : Math.max(sideTop[0], sideTop[1]) + 'px';
}

function honBuildFilters() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const genres = ['all', ...new Set(HON_CATALOG.map(i => i.genre))];
  bar.innerHTML = genres.map(g =>
    `<button class="filter-chip ${g === 'all' ? 'active' : ''}" aria-pressed="${g === 'all'}" data-genre="${honEscape(g)}">${g === 'all' ? 'All Titles' : honEscape(g)}</button>`
  ).join('');
  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      bar.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      honRenderShelf(chip.dataset.genre);
    });
  });
}

function honUpdateStats() {
  const total = HON_CATALOG.length;
  const checkedOut = Object.values(honState).filter(s => s.status !== 'available').length;
  const yours = Object.values(honState).filter(s => s.status === 'checked_out_you').length;
  const el = document.getElementById('catalog-stats');
  if (el) {
    el.innerHTML = `<span class="mono-tag">${total} titles</span> · <span class="mono-tag">${checkedOut} in circulation</span> · <span class="mono-tag">${yours} on your card</span>`;
  }
}

function honRenderShelf(filter) {
  const active = filter || document.querySelector('.filter-chip.active')?.dataset.genre || 'all';
  const items = active === 'all' ? HON_CATALOG : HON_CATALOG.filter(i => i.genre === active);
  honLayoutShelf(items);
  honUpdateStats();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('shelf')) {
    const shelf = document.getElementById('shelf');
    shelf.innerHTML = '<p class="eyebrow" style="padding: 40px 0;">LOADING THE SHELF…</p>';
    try {
      await honFetchCatalog();
    } catch (err) {
      shelf.innerHTML = `<p class="eyebrow" style="padding: 40px 0; color:var(--red);">Couldn't load the catalog: ${honEscape(err.message || err)}</p>`;
      return;
    }
    honBuildFilters();
    // honFetchAllStatuses catches failures per-item (a bad item still gets
    // a safe default so one broken request doesn't take down the whole
    // shelf) — this call itself never rejects.
    await honFetchAllStatuses(HON_CATALOG);
    honRenderShelf('all');
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => honRenderShelf(), 200);
    });
  }
});
