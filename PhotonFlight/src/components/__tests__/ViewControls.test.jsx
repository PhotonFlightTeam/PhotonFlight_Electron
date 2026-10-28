import * as THREE from 'three';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewControls from '../ViewControls';

const viewMocks = vi.hoisted(() => ({
  useThree: vi.fn(),
  controls: null,
}));

vi.mock('@react-three/fiber', () => ({
  useThree: viewMocks.useThree,
}));

vi.mock('@react-three/drei', async () => {
  const React = await import('react');
  return {
    OrbitControls: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => viewMocks.controls);
      return <div data-testid="orbit-controls" />;
    }),
  };
});

describe('ViewControls', () => {
  let camera;
  let canvas;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 50);
    canvas = document.createElement('canvas');
    viewMocks.controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    viewMocks.useThree.mockReturnValue({ camera, gl: { domElement: canvas } });
  });

  it('renders orbit controls and changes to the top view when T is pressed', () => {
    const setZoom = vi.fn();
    const { getByTestId } = render(
      <ViewControls zoomRequest={{ value: 180 }} setZoom={setZoom} />,
    );

    expect(getByTestId('orbit-controls')).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: 't' });

    expect(camera.position.toArray()).toEqual([0, 0, 500]);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    expect(viewMocks.controls.update).toHaveBeenCalled();
    expect(setZoom).toHaveBeenCalled();
  });

  it('applies a slider zoom request to the camera', () => {
    render(<ViewControls zoomRequest={{ value: 200 }} setZoom={vi.fn()} />);

    expect(camera.position.length()).toBeCloseTo(1);
  });
});
