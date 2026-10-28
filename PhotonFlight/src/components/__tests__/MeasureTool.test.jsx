import * as THREE from 'three';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MeasureTool from '../MeasureTool';
import useStore from '../../useStore';

const threeMocks = vi.hoisted(() => ({
  useThree: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: threeMocks.useThree,
}));

vi.mock('@react-three/drei', () => ({
  Line: () => <div data-testid="measure-line" />,
  Billboard: ({ children }) => <div>{children}</div>,
  Text: ({ children }) => <div>{children}</div>,
}));

describe('MeasureTool', () => {
  let canvas;
  let intersectionSpy;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 100 });
    Object.defineProperty(canvas, 'clientHeight', { value: 100 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    threeMocks.useThree.mockReturnValue({
      camera: new THREE.PerspectiveCamera(),
      gl: { domElement: canvas },
    });
    useStore.setState({
      positions: new Float32Array([0, 0, 0, 3, 4, 0]),
      measures: null,
    });
    intersectionSpy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject');
  });

  it('records clicked points and renders a segment length', () => {
    intersectionSpy.mockReturnValue([{ index: 0 }]);
    const pointsRef = { current: {} };
    render(<MeasureTool pointsRef={pointsRef} activeTool="Measure" fileUrl="cloud.laz" />);

    fireEvent.click(canvas, { clientX: 50, clientY: 50 });
    intersectionSpy.mockReturnValue([{ index: 1 }]);
    fireEvent.click(canvas, { clientX: 50, clientY: 50 });

    expect(useStore.getState().measures).toEqual([0, 0, 0, 3, 4, 0]);
    expect(screen.getByTestId('measure-line')).toBeInTheDocument();
    expect(screen.getByText('5.00')).toBeInTheDocument();

    fireEvent.keyDown(canvas, { key: 'd' });
    expect(useStore.getState().measures).toEqual([0, 0, 0]);
    expect(screen.queryByTestId('measure-line')).not.toBeInTheDocument();
  });

  it('ignores clicks when the measure tool is inactive', () => {
    intersectionSpy.mockReturnValue([{ index: 0 }]);
    render(<MeasureTool pointsRef={{ current: {} }} activeTool="Select" fileUrl="cloud.laz" />);

    fireEvent.click(canvas, { clientX: 50, clientY: 50 });

    expect(useStore.getState().measures).toBeNull();
  });
});
