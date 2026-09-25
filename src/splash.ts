/** Keep the splash up at least this long (ms since navigation start) so its intro can finish. */
const MIN_VISIBLE_MS = 2700;
/** Clean up even if `animationend` never fires (e.g. background tab). */
const EXIT_FALLBACK_MS = 1700;
/** Side of the splash floor plane in index.html (px). It lands centered in the viewport at scale 1. */
const FLOOR_SIZE = 3200;

/**
 * Trace the app's real grid lines (already rendered under the splash) onto a canvas placed on the
 * splash floor. Cells are measured on screen, so zoom, custom column widths / row heights, merges and
 * the scroll position are all reproduced exactly. Once the floor lands (scale 1, facing the camera),
 * floor-local = viewport coordinates offset by (FLOOR_SIZE − viewport) / 2, so the lines coincide
 * with the real ones.
 */
function traceRealGrid(floor: Element): void {
  const grid = document.querySelector('#root [role="grid"]');
  const cells = document.querySelectorAll('#root [role="gridcell"]');
  if (!grid || cells.length === 0) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'sp-floor-real';
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  Object.assign(canvas.style, {
    left: `${(FLOOR_SIZE - vw) / 2}px`,
    top: `${(FLOOR_SIZE - vh) / 2}px`,
    width: `${vw}px`,
    height: `${vh}px`,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // Only the cell viewport (cells overscanned under the headers/toolbar aren't visible in the app)
  const clip = grid.getBoundingClientRect();
  ctx.beginPath();
  ctx.rect(clip.left, clip.top, clip.width, clip.height);
  ctx.clip();

  // Each cell draws its own right + bottom border, like Cell.tsx; its width follows the zoom
  const sample = cells[0] as HTMLElement;
  const zoom =
    sample.offsetWidth > 0 ? sample.getBoundingClientRect().width / sample.offsetWidth : 1;
  ctx.strokeStyle =
    getComputedStyle(document.documentElement).getPropertyValue('--color-grid-line').trim() ||
    '#E2E8F0';
  ctx.lineWidth = zoom;
  ctx.beginPath();
  for (const el of cells) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue; // hidden (e.g. non-anchor merge cells)
    ctx.moveTo(r.right - zoom / 2, r.top);
    ctx.lineTo(r.right - zoom / 2, r.bottom);
    ctx.moveTo(r.left, r.bottom - zoom / 2);
    ctx.lineTo(r.right, r.bottom - zoom / 2);
  }
  ctx.stroke();
  floor.appendChild(canvas);
}

/**
 * Dismiss the static splash overlay from index.html with its "floor becomes the sheet" exit: the
 * glass panes float away while the 3D floor stands up; on the way its uniform grid gives way to a
 * trace of the real sheet's grid, which lands exactly on the app's lines. Then the backdrop clears
 * onto the app (`html.app-revealing` slides its chrome in).
 * Idempotent (StrictMode / repeated calls) and a no-op when there is no splash.
 */
export function hideSplash(): void {
  const el = document.getElementById('splash');
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = 'true';

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const wait = reducedMotion ? 0 : Math.max(0, MIN_VISIBLE_MS - performance.now());
  setTimeout(() => {
    const html = document.documentElement;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.remove();
      html.classList.remove('app-revealing');
    };
    setTimeout(finish, EXIT_FALLBACK_MS);

    const floor = el.querySelector('.sp-floor');
    if (reducedMotion || !floor) {
      el.classList.add('splash-fade');
      el.addEventListener('animationend', finish, { once: true });
      return;
    }

    traceRealGrid(floor);
    html.classList.add('app-revealing');
    el.classList.add('splash-out');
    el.addEventListener('animationend', (e) => {
      // The floor's final fade ends the transition (other exit animations bubble up here too)
      if (e.animationName === 'sp-floor-out') finish();
    });
  }, wait);
}
