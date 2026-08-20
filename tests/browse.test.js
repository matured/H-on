import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import browse from '../js/browse.js';
import circ from '../js/circulation.js';

const { honSeeded, honLayoutShelf } = browse;
const { honEscape, honStatusInfo, setHonState, setHonCatalog } = circ;

// The new per-item hover personality (hoverRotate/hoverScale/hoverLift in
// honLayoutShelf, js/browse.js) is built entirely from honSeeded() plugged
// into fixed linear formulas:
//   hoverRotate = -4 + (honSeeded(seed) - 0.5) * 16   // seed = i*13+5
//   hoverScale  = 1.16 + (honSeeded(seed) - 0.5) * 0.08 // seed = i*17+6
//   hoverLift   = -14 + (honSeeded(seed) - 0.5) * 8    // seed = i*19+7
// honLayoutShelf itself can't run outside a real DOM (it reads
// document.getElementById('shelf'), HON_CATALOG, shelf.clientWidth, etc.),
// so these tests lock in the one thing that formula actually depends on:
// honSeeded's determinism and [0, 1) range. That's what guarantees "same
// catalog item always gets the same hover feel" and "hover values stay
// inside the intended rotate/scale/lift bounds" — the two properties the
// hover feature promises.
function hoverRotateFor(globalIndex) {
  return -4 + (honSeeded(globalIndex * 13 + 5) - 0.5) * 16;
}
function hoverScaleFor(globalIndex) {
  return 1.16 + (honSeeded(globalIndex * 17 + 6) - 0.5) * 0.08;
}
function hoverLiftFor(globalIndex) {
  return -14 + (honSeeded(globalIndex * 19 + 7) - 0.5) * 8;
}

describe('honSeeded', () => {
  it('is deterministic — same seed always returns the same value', () => {
    for (const seed of [0, 5, 13, 17, 19, 118, 1005]) {
      expect(honSeeded(seed)).toBe(honSeeded(seed));
    }
  });

  it('stays within [0, 1) across the seed range used for hover variation', () => {
    for (let globalIndex = 0; globalIndex < 200; globalIndex++) {
      for (const seed of [globalIndex * 13 + 5, globalIndex * 17 + 6, globalIndex * 19 + 7]) {
        const value = honSeeded(seed);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});

describe('per-item hover variation (hoverRotate/hoverScale/hoverLift formulas)', () => {
  it('keeps each derived value inside its intended visual bounds', () => {
    for (let globalIndex = 0; globalIndex < 200; globalIndex++) {
      expect(hoverRotateFor(globalIndex)).toBeGreaterThanOrEqual(-12);
      expect(hoverRotateFor(globalIndex)).toBeLessThanOrEqual(4);

      expect(hoverScaleFor(globalIndex)).toBeGreaterThanOrEqual(1.12);
      expect(hoverScaleFor(globalIndex)).toBeLessThanOrEqual(1.2);

      expect(hoverLiftFor(globalIndex)).toBeGreaterThanOrEqual(-18);
      expect(hoverLiftFor(globalIndex)).toBeLessThanOrEqual(-10);
    }
  });

  it('gives different catalog items a distinct hover feel, not one shared value', () => {
    const rotates = new Set();
    const scales = new Set();
    const lifts = new Set();
    for (let globalIndex = 0; globalIndex < 20; globalIndex++) {
      rotates.add(hoverRotateFor(globalIndex).toFixed(1));
      scales.add(hoverScaleFor(globalIndex).toFixed(2));
      lifts.add(hoverLiftFor(globalIndex).toFixed(1));
    }
    // Not a strict "all unique" requirement (honSeeded can coincide), but a
    // regression that collapsed the per-item variation back to one constant
    // value for every item — the exact bug this diff fixes — would leave
    // each set with size 1.
    expect(rotates.size).toBeGreaterThan(1);
    expect(scales.size).toBeGreaterThan(1);
    expect(lifts.size).toBeGreaterThan(1);
  });

  it('is stable across repeated layout calls for the same catalog item', () => {
    const globalIndex = 42;
    expect(hoverRotateFor(globalIndex)).toBe(hoverRotateFor(globalIndex));
    expect(hoverScaleFor(globalIndex)).toBe(hoverScaleFor(globalIndex));
    expect(hoverLiftFor(globalIndex)).toBe(hoverLiftFor(globalIndex));
  });
});

// honLayoutShelf() itself is the actual DOM-write path this diff added
// (three el.style.setProperty(--cover-hover-*) calls per rendered card).
// Running it for real means giving it the same ambient globals it gets
// from circulation.js in the browser (classic <script> tags share one
// global scope there) — honEscape/honStatusInfo come from the real
// circulation.js module, HON_CATALOG is a small fake catalog. None of the
// fake items set coverImage, so honCoverHTML takes the placeholder
// branch and honImageVariant (not exported by circulation.js, and not
// stubbed here) is never called — matching what the diff's own review
// scope covers.
describe('honLayoutShelf — DOM write path (real jsdom elements)', () => {
  const items = [
    { id: 'alpha-1', genre: 'travel', title: 'Alpha Monthly', issue: 'No. 1', era: '1920s', call: 'AA.1', coverBg: '#111111', coverFg: '#eeeeee', coverAccent: '#ff0000' },
    { id: 'beta-2', genre: 'travel', title: 'Beta Weekly', issue: 'No. 2', era: '1930s', call: 'BB.2', coverBg: '#222222', coverFg: '#dddddd', coverAccent: '#00ff00' },
    { id: 'gamma-3', genre: 'design', title: 'Gamma Digest', issue: 'No. 3', era: '1940s', call: 'CC.3', coverBg: '#333333', coverFg: '#cccccc', coverAccent: '#0000ff' },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="shelf"></div>';
    global.HON_CATALOG = items;
    global.honEscape = honEscape;
    global.honStatusInfo = honStatusInfo;
    setHonState({});
    setHonCatalog(items);
  });

  afterEach(() => {
    delete global.HON_CATALOG;
    delete global.honEscape;
    delete global.honStatusInfo;
    document.body.innerHTML = '';
  });

  it('renders one .shelf-item per catalog item, each carrying the three hover custom properties within bounds', () => {
    expect(() => honLayoutShelf(items)).not.toThrow();

    const rendered = document.querySelectorAll('#shelf .shelf-item');
    expect(rendered.length).toBe(items.length);

    rendered.forEach((el) => {
      const rotateRaw = el.style.getPropertyValue('--cover-hover-rotate');
      const scaleRaw = el.style.getPropertyValue('--cover-hover-scale');
      const liftRaw = el.style.getPropertyValue('--cover-hover-lift');

      expect(rotateRaw).toMatch(/^-?\d+(\.\d+)?deg$/);
      expect(scaleRaw).toMatch(/^\d+(\.\d+)?$/);
      expect(liftRaw).toMatch(/^-?\d+(\.\d+)?px$/);

      const rotate = parseFloat(rotateRaw);
      const scale = parseFloat(scaleRaw);
      const lift = parseFloat(liftRaw);

      expect(rotate).toBeGreaterThanOrEqual(-12);
      expect(rotate).toBeLessThanOrEqual(4);
      expect(scale).toBeGreaterThanOrEqual(1.12);
      expect(scale).toBeLessThanOrEqual(1.2);
      expect(lift).toBeGreaterThanOrEqual(-18);
      expect(lift).toBeLessThanOrEqual(-10);
    });
  });

  it('gives different catalog items different rendered hover custom properties', () => {
    honLayoutShelf(items);
    const rendered = [...document.querySelectorAll('#shelf .shelf-item')];

    const rotates = rendered.map(el => el.style.getPropertyValue('--cover-hover-rotate'));
    const scales = rendered.map(el => el.style.getPropertyValue('--cover-hover-scale'));
    const lifts = rendered.map(el => el.style.getPropertyValue('--cover-hover-lift'));

    // The regression this diff fixes: every card sharing one hardcoded
    // hover transform. Three fake items with distinct seeds should not
    // all land on the same rendered value.
    expect(new Set(rotates).size).toBeGreaterThan(1);
    expect(new Set(scales).size).toBeGreaterThan(1);
    expect(new Set(lifts).size).toBeGreaterThan(1);
  });

  it('takes the placeholder cover branch for items with no coverImage', () => {
    honLayoutShelf(items);
    expect(document.querySelectorAll('#shelf .shelf-cover').length).toBe(items.length);
    expect(document.querySelector('#shelf .shelf-cover-photo')).toBeNull();
  });
});
