// Site-wide "coming soon" gate (T20). Shown to every visitor who isn't the
// admin, on every page, until launch. Depends on honSupabase (from
// supabase-config.js) and honSignInWithEmail (from circulation.js) being
// loaded first — see the script order comment in each page's <script> block.
//
// The admin bypass in js/main.js decides WHETHER this renders; this file is
// only what it renders. It works the same way js/main.js's own fullscreen
// nav overlay does: prepend an element, mark every existing body child
// `inert` so Tab/AT can't reach the real page underneath, done.
const HON_LOCK_LAUNCH_LABEL = 'November 30, 2026';

function honRenderLockScreen() {
  const el = document.createElement('div');
  el.id = 'hon-lock-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '本 is launching soon');
  el.innerHTML = `
    <div class="hon-lock-inner">
      <p class="hon-lock-mark" aria-hidden="true">本</p>
      <p class="hon-lock-eyebrow">COMING SOON</p>
      <h1 class="hon-lock-headline">Launching ${HON_LOCK_LAUNCH_LABEL}.</h1>
      <p class="hon-lock-sub">A circulating archive of Japanese print media, 1998–2025. Invite-only. Leave your email and we’ll let you know the moment it opens.</p>
      <form id="hon-lock-waitlist-form" class="hon-lock-form">
        <input id="hon-lock-name" type="text" name="name" placeholder="Name" autocomplete="name" required>
        <input id="hon-lock-email" type="email" name="email" placeholder="Email" autocomplete="email" required>
        <button type="submit" class="btn btn-solid" id="hon-lock-submit">Notify Me &rarr;</button>
      </form>
      <p id="hon-lock-status" role="status" aria-live="polite" class="hon-lock-status"></p>
      <button type="button" id="hon-lock-team-toggle" class="hon-lock-team-toggle">Site team? Sign in</button>
      <form id="hon-lock-signin-form" class="hon-lock-signin-form" hidden>
        <input id="hon-lock-signin-email" type="email" name="email" placeholder="Email" autocomplete="email" required>
        <button type="submit" class="btn" id="hon-lock-signin-submit">Send Link &rarr;</button>
        <p id="hon-lock-signin-status" role="status" aria-live="polite" class="hon-lock-status"></p>
      </form>
    </div>
  `;

  document.body.prepend(el);
  [...document.body.children]
    .filter((child) => child !== el)
    .forEach((child) => child.setAttribute('inert', ''));
  document.body.classList.add('hon-locked');

  honLockWireWaitlistForm();
  honLockWireSignIn();
}

function honLockWireWaitlistForm() {
  const form = document.getElementById('hon-lock-waitlist-form');
  const statusEl = document.getElementById('hon-lock-status');
  const btn = document.getElementById('hon-lock-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('hon-lock-name').value.trim();
    const email = document.getElementById('hon-lock-email').value.trim();
    btn.disabled = true;
    btn.textContent = 'Sending…';
    statusEl.textContent = '';
    try {
      const { error } = await honSupabase.from('waitlist_requests').insert({ name, email, note: null });
      if (error) throw error;
      form.reset();
      form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
      statusEl.textContent = '✓ You’re on the list. We’ll email you the moment it opens.';
      statusEl.style.color = 'var(--ink)';
      btn.style.display = 'none';
    } catch (err) {
      statusEl.textContent = `Couldn’t send that: ${err.message || err}`;
      statusEl.style.color = 'var(--red)';
      btn.disabled = false;
      btn.textContent = 'Notify Me →';
    }
  });
}

// Lets the admin bootstrap a session from a fresh/cleared browser without
// needing the real site unlocked first — the magic link always redirects to
// membership.html (see honSignInWithEmail), which re-runs this same admin
// check on load and unlocks automatically once the session lands.
function honLockWireSignIn() {
  const toggle = document.getElementById('hon-lock-team-toggle');
  const signinForm = document.getElementById('hon-lock-signin-form');

  toggle.addEventListener('click', () => {
    signinForm.hidden = !signinForm.hidden;
    if (!signinForm.hidden) document.getElementById('hon-lock-signin-email').focus();
  });

  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('hon-lock-signin-email').value.trim();
    const statusEl = document.getElementById('hon-lock-signin-status');
    const btn = document.getElementById('hon-lock-signin-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    statusEl.textContent = '';
    try {
      await honSignInWithEmail(email);
      statusEl.textContent = `Check ${email} for a sign-in link.`;
      statusEl.style.color = 'var(--ink)';
    } catch (err) {
      statusEl.textContent = `Couldn’t send that: ${err.message || err}`;
      statusEl.style.color = 'var(--red)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Link →';
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { honRenderLockScreen, honLockWireWaitlistForm, honLockWireSignIn, HON_LOCK_LAUNCH_LABEL };
}
