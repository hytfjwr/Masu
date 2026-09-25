// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValidationDropdown } from './index';

const OPTIONS = ['Apple', 'Banana', 'Cherry'];

describe('ValidationDropdown', () => {
  it('filters the option list as the search input changes', () => {
    render(
      <ValidationDropdown options={OPTIONS} currentValue="" x={0} y={0} onSelect={() => {}} onClose={() => {}} />,
    );

    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.getByText('Cherry')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('検索'), { target: { value: 'an' } });

    expect(screen.queryByText('Apple')).toBeNull();
    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.queryByText('Cherry')).toBeNull();
  });

  it('selects the highlighted option on Enter', () => {
    const onSelect = vi.fn();
    render(
      <ValidationDropdown options={OPTIONS} currentValue="" x={0} y={0} onSelect={onSelect} onClose={() => {}} />,
    );

    const search = screen.getByPlaceholderText('検索');
    fireEvent.change(search, { target: { value: 'Banana' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('Banana');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ValidationDropdown options={OPTIONS} currentValue="" x={0} y={0} onSelect={() => {}} onClose={onClose} />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText('検索'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
