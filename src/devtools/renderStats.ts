/**
 * Render instrumentation for the developer tools (Rendering tab). Cell bumps `cellCommits` after
 * every commit it takes part in; with `flash` on it also briefly outlines itself, so re-rendered
 * cells light up. Plain mutable module state: read by polling, never drives React rendering.
 */
export const renderStats = {
  flash: false,
  cellCommits: 0,
};

const FLASH_KEYFRAMES: Keyframe[] = [
  { boxShadow: 'inset 0 0 0 2px rgb(236 72 153 / 0.95)', backgroundColor: 'rgb(236 72 153 / 0.14)' },
  { boxShadow: 'inset 0 0 0 2px rgb(236 72 153 / 0)', backgroundColor: 'rgb(236 72 153 / 0)' },
];

/** Called from Cell's commit effect. */
export function noteCellCommit(el: HTMLElement | null): void {
  renderStats.cellCommits++;
  if (renderStats.flash && el) el.animate(FLASH_KEYFRAMES, { duration: 650, easing: 'ease-out' });
}
