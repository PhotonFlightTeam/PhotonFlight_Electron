import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolBar from '../ToolBar';

describe('ToolBar', () => {
  it('selects each tool when its button is clicked', () => {
    const setActiveTool = vi.fn();
    render(<ToolBar activeTool="Select" setActiveTool={setActiveTool} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);

    expect(setActiveTool.mock.calls).toEqual([
      ['Select'],
      ['Measure'],
      ['Pin'],
    ]);
  });
});
