// @vitest-environment happy-dom
import { describe, it, expect } from 'vite-plus/test';
import { render } from '@testing-library/react';
import { PrecedentArrows } from './PrecedentArrows';

describe('PrecedentArrows', () => {
  it('outlines a range that touches the formula cell without drawing a degenerate arrow', () => {
    // B2 (source) sits directly above B3 (target): their facing edges coincide
    const { container } = render(
      <PrecedentArrows
        sources={[{ rect: { left: 100, top: 24, width: 100, height: 24 }, color: '#2563EB' }]}
        target={{ left: 100, top: 48, width: 100, height: 24 }}
      />,
    );
    expect(container.innerHTML).not.toContain('NaN');
    expect(container.querySelectorAll('.precedent-range')).toHaveLength(1);
    expect(container.querySelectorAll('.precedent-path')).toHaveLength(0);
  });

  it('draws an arrow for a range further away', () => {
    const { container } = render(
      <PrecedentArrows
        sources={[{ rect: { left: 0, top: 0, width: 100, height: 72 }, color: '#2563EB' }]}
        target={{ left: 300, top: 48, width: 100, height: 24 }}
      />,
    );
    expect(container.querySelectorAll('.precedent-path')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });
});
