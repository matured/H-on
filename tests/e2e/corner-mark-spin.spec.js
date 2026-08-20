const { test, expect } = require('@playwright/test');

// #hon-corner-mark is injected site-wide by js/main.js (honInjectCornerMark)
// on every page's DOMContentLoaded — home.html needs no backend mocking to
// exercise it, unlike catalog.html. The mark is two stacked .hon-corner-face
// spans (front/back), each independently animated and phase-shifted by half
// a cycle, rather than one rotating element — see the comment above
// honInjectCornerMark in js/main.js for why a single rotating face can't
// work: backface-visibility:hidden makes a lone face render nothing (not a
// mirror) for the half of the rotation where its back points at the viewer.
test.describe('Site-wide corner brand mark — 3D spin', () => {
  test('rotateY animation carries the perspective divisor onto its own transform', async ({ page }) => {
    await page.goto('/home.html');
    const faces = page.locator('.hon-corner-face');
    await expect(faces).toHaveCount(2);
    const front = faces.first();

    // Deterministically park the animation halfway through its 36s cycle
    // (rotateY(180deg) of the 0deg->360deg keyframe) via the Web Animations
    // API instead of waiting on real time — avoids a slow, timing-dependent,
    // potentially flaky test for what's otherwise a pure CSS-math check.
    // js/main.js sets a per-page-load NEGATIVE animation-delay (derived from
    // Date.now(), so the spin looks continuous across navigations instead of
    // restarting) — currentTime is relative to that delay, so it has to be
    // zeroed first or the halfway point lands at an unpredictable phase.
    await front.evaluate((el) => {
      el.style.animationDelay = '0s';
      const anim = el.getAnimations()[0];
      anim.pause();
      anim.currentTime = 18000;
    });

    const transform = await front.evaluate((el) => getComputedStyle(el).transform);
    const match = transform.match(/^matrix3d\(([^)]+)\)$/);
    expect(match, `expected a matrix3d(...) computed transform, got "${transform}"`).not.toBeNull();
    const values = match[1].split(',').map(Number);

    // Before this fix, `perspective: 1200px` was set as a standalone
    // property on the rotating element itself. Per the CSS Transforms spec,
    // a standalone `perspective` property only establishes 3D space for the
    // element's CHILDREN's transforms — it does not affect the element's
    // own transform. So the element's own rotateY() came out "flat": a
    // matrix3d whose perspective-divisor term (empirically, index 11 in the
    // 16-value list — verified separately against a plain `rotateY(180deg)`
    // vs `perspective(1200px) rotateY(180deg)` control pair) is exactly 0.
    // Folding `perspective(1200px)` into the `rotateY()` transform function
    // list itself (this diff's fix) is what makes that divisor nonzero —
    // the literal, provable difference between "spins flat" and "spins in
    // 3D". This is a real assertion on the actual bug, not a proxy for it.
    expect(values[11]).not.toBe(0);
    expect(values[11]).toBeCloseTo(1 / 1200, 6);
  });

  test('front and back faces are phase-shifted by exactly half a cycle', async ({ page }) => {
    await page.goto('/home.html');
    const faces = page.locator('.hon-corner-face');
    await expect(faces).toHaveCount(2);

    const delaysMs = await faces.evaluateAll((els) =>
      els.map((el) => {
        const raw = el.style.animationDelay; // e.g. "-12345ms"
        return -parseFloat(raw);
      })
    );

    const [frontElapsed, backElapsed] = delaysMs;
    const diff = ((backElapsed - frontElapsed) % 36000 + 36000) % 36000;
    // Half of the 36s cycle, allowing for the ms rounding main.js does.
    expect(diff).toBeGreaterThan(17999);
    expect(diff).toBeLessThan(18001);
  });

  test('at any point in the cycle, at least one face is front-facing (mark never fully disappears)', async ({ page }) => {
    await page.goto('/home.html');
    const faces = page.locator('.hon-corner-face');
    await expect(faces).toHaveCount(2);

    // rotateY(theta)'s matrix3d has cos(theta) at index 0 (m11). A face is
    // front-facing (not hidden by backface-visibility) when |theta| < 90deg,
    // i.e. cos(theta) > 0. Sampling both faces across a full cycle and
    // requiring at least one m0 > 0 at every sample directly proves the
    // "never blinks out" guarantee the two-face structure exists for.
    const allFrontFacing = await page.evaluate(async () => {
      const els = [...document.querySelectorAll('.hon-corner-face')];
      // Deliberately leave each face's animation-delay exactly as
      // main.js set it (they differ by a half-cycle — see the
      // "phase-shifted by exactly half a cycle" test above). currentTime
      // is absolute local time, which is compared against each
      // animation's OWN delay internally — pausing and sampling the same
      // currentTime on both faces still yields two positions ~18s apart,
      // which is the actual thing under test. Resetting both delays to
      // 0 first (as an earlier draft of this test did) would put both
      // faces in lockstep instead and silently defeat the assertion.
      els.forEach((el) => { el.getAnimations()[0].pause(); });
      const duration = els[0].getAnimations()[0].effect.getTiming().duration;
      const samples = 16;
      for (let i = 0; i < samples; i++) {
        const t = (duration * i) / samples;
        const cosValues = els.map((el) => {
          el.getAnimations()[0].currentTime = t;
          const m = getComputedStyle(el).transform.match(/matrix3d\(([^)]+)\)/);
          return parseFloat(m[1].split(',')[0]);
        });
        if (!cosValues.some((c) => c > 0)) return false;
      }
      return true;
    });

    expect(allFrontFacing).toBe(true);
  });

  test('prefers-reduced-motion disables the spin on both faces', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/home.html');
    const faces = page.locator('.hon-corner-face');
    await expect(faces).toHaveCount(2);

    const animationNames = await faces.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(animationNames).toEqual(['none', 'none']);
  });
});
