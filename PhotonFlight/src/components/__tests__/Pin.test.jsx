import * as THREE from 'three';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PinTool from '../Pin';
import useStore from '../../useStore';

const threeMocks = vi.hoisted(() => ({
  useThree: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: threeMocks.useThree,
}));

vi.mock('@react-three/drei', () => ({
  Html: ({ children }) => <div data-testid="pin-marker">{children}</div>,
}));

describe('PinTool', () => {
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
      pinpoints: null,
    });
    intersectionSpy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject');
  });

  it('adds pins at intersected points and clears them with the D key', () => {
    intersectionSpy.mockReturnValue([{ index: 1 }]);
    render(<PinTool pointsRef={{ current: {} }} activeTool="Pin" fileUrl="cloud.laz" />);

    fireEvent.click(canvas, { clientX: 50, clientY: 50 });

    expect(useStore.getState().pinpoints).toEqual([3, 4, 0]);
    expect(screen.getByTestId('pin-marker')).toBeInTheDocument();

    fireEvent.keyDown(canvas, { key: 'd' });
    expect(useStore.getState().pinpoints).toEqual([]);
    expect(screen.queryByTestId('pin-marker')).not.toBeInTheDocument();
  });

  it('does not add pins when the pin tool is inactive', () => {
    intersectionSpy.mockReturnValue([{ index: 0 }]);
    render(<PinTool pointsRef={{ current: {} }} activeTool="Measure" fileUrl="cloud.laz" />);

    fireEvent.click(canvas, { clientX: 50, clientY: 50 });

    expect(useStore.getState().pinpoints).toBeNull();
  });
});
