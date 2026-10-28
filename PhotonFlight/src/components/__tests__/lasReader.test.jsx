import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LasViewer from '../lasReader';
import useStore from '../../useStore';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
}));

vi.mock('@react-three/drei', () => ({
  GizmoHelper: ({ children }) => <div>{children}</div>,
  GizmoViewport: () => <div data-testid="gizmo" />,
}));

vi.mock('../PointCloudViewer', () => ({
  default: ({ active, fileUrl }) => (
    <div data-testid="point-cloud" data-active={active} data-file={String(fileUrl)} />
  ),
}));

vi.mock('../MeasureTool', () => ({
  default: ({ activeTool }) => <div data-testid="measure-tool" data-tool={activeTool} />,
}));

vi.mock('../Pin', () => ({
  default: ({ activeTool }) => <div data-testid="pin-tool" data-tool={activeTool} />,
}));

vi.mock('../ViewControls', () => ({
  default: () => <div data-testid="view-controls" />,
}));

describe('LasViewer', () => {
  let callbacks;
  let unsubscribeImport;
  let unsubscribeExport;

  beforeEach(() => {
    callbacks = {};
    unsubscribeImport = vi.fn();
    unsubscribeExport = vi.fn();
    window.electronAPI = {
      onFileImported: vi.fn((callback) => {
        callbacks.import = callback;
        return unsubscribeImport;
      }),
      onFileExported: vi.fn((callback) => {
        callbacks.export = callback;
        return unsubscribeExport;
      }),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };
    useStore.setState({ colors: new Float32Array([1, 0, 0]), positions: new Float32Array([0, 0, 0]) });
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it('renders the viewer, tool selection, and bounded zoom controls', () => {
    render(<LasViewer fileUrl="initial.laz" />);

    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('point-cloud')).toHaveAttribute('data-file', 'initial.laz');
    expect(screen.getByTestId('measure-tool')).toHaveAttribute('data-tool', 'Select');
    expect(screen.getByTestId('pin-tool')).toHaveAttribute('data-tool', 'Select');
    expect(screen.getByRole('slider', { name: 'Camera Zoom' })).toHaveAttribute('aria-valuenow', '180');

    fireEvent.click(screen.getByText('+'));
    expect(screen.getByRole('slider', { name: 'Camera Zoom' })).toHaveAttribute('aria-valuenow', '190');
    fireEvent.click(screen.getByText('+'));
    fireEvent.click(screen.getByText('+'));
    expect(screen.getByRole('slider', { name: 'Camera Zoom' })).toHaveAttribute('aria-valuenow', '200');
  });

  it('switches active tools and clears cached colors on view changes', () => {
    render(<LasViewer fileUrl="initial.laz" />);

    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(screen.getAllByTestId('measure-tool').some(
      (tool) => tool.getAttribute('data-tool') === 'Measure',
    )).toBe(true);

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Height' }));
    expect(screen.getByTestId('point-cloud')).toHaveAttribute('data-active', 'height');
    expect(useStore.getState().colors).toBeNull();
  });

  it('subscribes to file events and unregisters listeners on unmount', () => {
    const { unmount } = render(<LasViewer fileUrl="initial.laz" />);

    expect(window.electronAPI.onFileImported).toHaveBeenCalledOnce();
    expect(window.electronAPI.onFileExported).toHaveBeenCalledOnce();
    unmount();

    expect(unsubscribeImport).toHaveBeenCalledOnce();
    expect(unsubscribeExport).toHaveBeenCalledOnce();
  });
});
