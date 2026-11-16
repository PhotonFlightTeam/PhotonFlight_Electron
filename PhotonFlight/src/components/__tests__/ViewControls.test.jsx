import * as THREE from 'three';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewControls from '../ViewControls';
import useStore from '../../useStore';

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
    FlyControls: () => <div data-testid="fly-controls" />,
  };
});

describe('ViewControls', () => {
  let camera;
  let canvas;

  beforeEach(() => {
    useStore.setState({ bounds: null });
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 50);
    canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
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

  it('resets above newly imported bounds while in flight mode', () => {
    const previousElectronAPI = window.electronAPI;
    const previousBounds = new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10),
    );
    const importedBounds = new THREE.Box3(
      new THREE.Vector3(-1, -2, -3),
      new THREE.Vector3(1, 2, 3),
    );
    let handleControlModeChange;
    useStore.setState({ bounds: previousBounds });
    window.electronAPI = {
      onControlModeChanged: vi.fn((callback) => {
        handleControlModeChange = callback;
        return vi.fn();
      }),
      setControlMode: vi.fn(),
    };

    try {
      const props = { zoomRequest: { value: 180 }, setZoom: vi.fn() };
      const { getByTestId, rerender } = render(
        <ViewControls {...props} fileUrl="first-file" />,
      );
      rerender(<ViewControls {...props} fileUrl="imported-file" />);

      act(() => handleControlModeChange('flight'));
      expect(getByTestId('fly-controls')).toBeInTheDocument();

      act(() => useStore.setState({ bounds: importedBounds }));

      const expectedDistance = importedBounds.getSize(new THREE.Vector3()).length() * 2;
      expect(camera.position.toArray()).toEqual([0, 0, expectedDistance]);
      expect(camera.up.toArray()).toEqual([0, 1, 0]);
      const direction = camera.getWorldDirection(new THREE.Vector3());
      expect(direction.x).toBeCloseTo(0);
      expect(direction.y).toBeCloseTo(0);
      expect(direction.z).toBeCloseTo(-1);
    } finally {
      if (previousElectronAPI === undefined) delete window.electronAPI;
      else window.electronAPI = previousElectronAPI;
    }
  });

  it('uses the latest bounds when syncing the slider after a map change', () => {
    const largeBounds = new THREE.Box3(
      new THREE.Vector3(-100, -100, -100),
      new THREE.Vector3(100, 100, 100),
    );
    const smallBounds = new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10),
    );
    const setZoom = vi.fn();
    useStore.setState({ bounds: largeBounds });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={setZoom} />);

    act(() => useStore.setState({ bounds: smallBounds }));

    const changeListeners = viewMocks.controls.addEventListener.mock.calls
      .filter(([eventName]) => eventName === 'change');
    expect(changeListeners).toHaveLength(2);

    const smallMapMaxDistance = smallBounds.getSize(new THREE.Vector3()).length() * 10;
    camera.position.set(0, 0, smallMapMaxDistance);
    changeListeners[1][1]();

    const zoomUpdater = setZoom.mock.calls[setZoom.mock.calls.length - 1][0];
    expect(zoomUpdater()).toBe(10);
  });

  it('logs and syncs control mode changes from the application menu', () => {
    const previousElectronAPI = window.electronAPI;
    let handleControlModeChange;
    const unsubscribe = vi.fn();
    const setControlMode = vi.fn().mockResolvedValue('flight');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    window.electronAPI = {
      onControlModeChanged: vi.fn((callback) => {
        handleControlModeChange = callback;
        return unsubscribe;
      }),
      setControlMode,
    };

    try {
      const { unmount } = render(
        <ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />,
      );

      handleControlModeChange('flight');

      expect(log).toHaveBeenCalledWith('Control mode changed:', 'flight');
      expect(setControlMode).toHaveBeenCalledWith('flight');
      unmount();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      if (previousElectronAPI === undefined) delete window.electronAPI;
      else window.electronAPI = previousElectronAPI;
      log.mockRestore();
    }
  });

  it('captures the pointer only in flight mode', () => {
    const previousElectronAPI = window.electronAPI;
    let handleControlModeChange;
    window.electronAPI = {
      onControlModeChanged: vi.fn((callback) => {
        handleControlModeChange = callback;
        return vi.fn();
      }),
      setControlMode: vi.fn(),
    };

    try {
      render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);

      fireEvent.pointerDown(canvas, { pointerId: 1 });
      expect(canvas.setPointerCapture).not.toHaveBeenCalled();

      act(() => handleControlModeChange('flight'));
      fireEvent.pointerDown(canvas, { pointerId: 2 });
      expect(canvas.setPointerCapture).toHaveBeenCalledWith(2);
    } finally {
      if (previousElectronAPI === undefined) delete window.electronAPI;
      else window.electronAPI = previousElectronAPI;
    }
  });
});
