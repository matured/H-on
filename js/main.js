// Shared site-wide behavior: injects the black-circle menu button
// and fullscreen overlay nav on every page, so markup only lives here.

const HON_NAV_LINKS = [
  { href: 'home.html', label: 'Top' },
  { href: 'about.html', label: 'About' },
  { href: 'catalog.html', label: 'Archive' },
  { href: 'how-it-works.html', label: 'How It Works' },
  { href: 'membership.html', label: 'Membership' },
  { href: 'support.html', label: 'Support' },
];

function honCurrentPage() {
  const path = location.pathname.split('/').pop() || 'index.html';
  return path;
}

// Lets keyboard users jump straight past the nav to the page content
// instead of tabbing through every overlay link first. Targets whatever
// <main> the page already has rather than requiring every page to add
// an id itself, since the nav injection is already the one shared place
// every page runs through.
function honInjectSkipLink() {
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  main.tabIndex = -1;

  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = `#${main.id}`;
  skip.textContent = 'Skip to content';
  skip.addEventListener('click', () => {
    // The href jump alone doesn't reliably move focus in every browser;
    // force it so the next Tab press continues from the content, not
    // wherever focus happened to be before the click.
    setTimeout(() => main.focus(), 0);
  });
  document.body.prepend(skip);
}

function honInjectNav() {
  const current = honCurrentPage();

  const btn = document.createElement('button');
  btn.className = 'menu-btn';
  btn.setAttribute('aria-label', 'Open menu');
  btn.innerHTML = `<span class="dot"></span><span class="close-x">&times;</span>`;

  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <div class="overlay-inner">
      <nav class="overlay-links">
        ${HON_NAV_LINKS.map(l => `<a href="${l.href}" ${l.href === current ? 'aria-current="page"' : ''}>${l.label}</a>`).join('')}
      </nav>
      <p class="overlay-meta">本 is a circulating archive of Japanese print media, 1998 to 2025. Invite-only.</p>
    </div>
  `;

  document.body.prepend(overlay);
  document.body.prepend(btn);

  function toggle() {
    const open = overlay.classList.toggle('open');
    btn.classList.toggle('open', open);
    document.body.classList.toggle('menu-locked', open);
  }

  btn.addEventListener('click', toggle);
  overlay.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') toggle();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) toggle();
  });

  honMaybeShowAdminLink(overlay, current);
}

// Only pages that load circulation.js have honFetchMyProfile — on the
// ones that don't (home/about/how-it-works/support), there's no signed-in
// admin state to check, so this is a silent no-op there.
async function honMaybeShowAdminLink(overlay, current) {
  if (typeof honFetchMyProfile !== 'function') return;

  let profile;
  try {
    profile = await honFetchMyProfile();
  } catch {
    return;
  }
  if (!profile || !profile.is_admin) return;

  const link = document.createElement('a');
  link.href = 'admin.html';
  link.textContent = 'Admin';
  if (current === 'admin.html') link.setAttribute('aria-current', 'page');
  overlay.querySelector('.overlay-links').appendChild(link);
}

// Queue notifications (T13). Silently skipped on pages that don't load
// the Supabase client at all (home/about/how-it-works/support — none of
// them need it otherwise) rather than adding that client to four pages
// just for this banner.
async function honShowNotifications() {
  if (typeof honSupabase === 'undefined') return;
  let user;
  try {
    user = await honGetCurrentUser();
  } catch {
    return;
  }
  if (!user) return;

  let notifications;
  try {
    notifications = await honFetchMyNotifications();
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    return;
  }
  if (!notifications.length) return;

  const banner = document.createElement('div');
  banner.className = 'hon-notify-banner';
  banner.innerHTML = `
    <span>${notifications.length === 1 ? "An item you’re waiting for is available." : `${notifications.length} items you’re waiting for are available.`} <a href="catalog.html">Check the Archive &rarr;</a></span>
    <button class="hon-notify-dismiss" aria-label="Dismiss">&times;</button>
  `;
  document.body.prepend(banner);

  banner.querySelector('.hon-notify-dismiss').addEventListener('click', async () => {
    banner.remove();
    try {
      await Promise.all(notifications.map(n => honMarkNotificationRead(n.id)));
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  honInjectNav();
  honInjectSkipLink();
  honShowNotifications();
});
