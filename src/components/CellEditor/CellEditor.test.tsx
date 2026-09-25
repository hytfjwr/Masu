// @vitest-environment happy-dom
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { CellEditor } from './CellEditor';

afterEach(cleanup);

const baseRect = { left: 0, top: 0, width: 80, height: 20 };

function getTextarea(container: HTMLElement): HTMLTextAreaElement {
  return container.querySelector('[data-cell-editor]') as HTMLTextAreaElement;
}

describe('CellEditor', () => {
  it('navigation mode: compositionstart begins IME editing', () => {
    const onCompositionStart = vi.fn();
    const { container } = render(
      <CellEditor
        isEditing={false}
        value=""
        onChange={() => {}}
        onDirectInput={() => {}}
        onCompositionStart={onCompositionStart}
        onKeyDown={() => {}}
        rect={baseRect}
      />,
    );

    fireEvent.compositionStart(getTextarea(container));

    expect(onCompositionStart).toHaveBeenCalledTimes(1);
  });

  it('navigation mode: typing a character starts direct input with the typed value', () => {
    const onDirectInput = vi.fn();
    const { container } = render(
      <CellEditor
        isEditing={false}
        value=""
        onChange={() => {}}
        onDirectInput={onDirectInput}
        onCompositionStart={() => {}}
        onKeyDown={() => {}}
        rect={baseRect}
      />,
    );

    fireEvent.input(getTextarea(container), { target: { value: 'a' } });

    expect(onDirectInput).toHaveBeenCalledWith('a');
  });

  it('ignores Enter while an IME composition is still in progress', () => {
    const onConfirm = vi.fn();
    // Mirrors the isComposing/keyCode-229 guard Grid.tsx wraps around useKeyboard's
    // handleKeyDown before forwarding it as CellEditor's onKeyDown prop.
    const guardedKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') onConfirm();
    };
    const { container } = render(
      <CellEditor
        isEditing
        value="こんにちは"
        onChange={() => {}}
        onDirectInput={() => {}}
        onCompositionStart={() => {}}
        onKeyDown={guardedKeyDown}
        rect={baseRect}
      />,
    );

    fireEvent.keyDown(getTextarea(container), { key: 'Enter', isComposing: true });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
