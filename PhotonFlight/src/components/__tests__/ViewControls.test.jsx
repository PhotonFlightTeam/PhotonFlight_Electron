import * as THREE from 'three';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewControls from '../ViewControls';
import useStore from '../../useStore';

const viewMocks = vi.hoisted(() => ({
  useThree: vi.fn(),
  controls: null,
  flyControlsDomElement: null,
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
    FlyControls: ({ domElement }) => {
      viewMocks.flyControlsDomElement = domElement;
      return <div data-testid="fly-controls" />;
    },
    GizmoHelper: ({ children }) => children,
    GizmoViewcube: () => null,
  };
});

describe('ViewControls', () => {
  let camera;
  let canvas;
  let viewerArea;

  beforeEach(() => {
    useStore.setState({ bounds: null, controlMode: 'position' });
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 50);
    canvas = document.createElement('canvas');
    viewerArea = document.createElement('div');
    viewerArea.className = 'viewer-area';
    const canvasContainer = document.createElement('div');
    canvasContainer.appendChild(canvas);
    viewerArea.appendChild(canvasContainer);
    canvas.setPointerCapture = vi.fn();
    viewMocks.flyControlsDomElement = null;
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
    useStore.setState({
      bounds: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 250)),
    });
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

  it('applies view and axis actions requested from the navigation sidebar', () => {
    useStore.setState({
      bounds: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 250)),
    });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);

    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 't' })));
    expect(camera.position.toArray()).toEqual([0, 0, 500]);

    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'x' })));
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'ArrowUp' })));
    expect(camera.position.x).toBe(10);
  });

  it('keeps keyboard shortcuts disabled in flight mode while allowing sidebar view buttons', () => {
    useStore.setState({
      bounds: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 250)),
      controlMode: 'flight',
    });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);

    const initialPosition = camera.position.clone();
    fireEvent.keyDown(canvas, { key: 't' });
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());

    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 't' })));
    expect(camera.position.toArray()).toEqual([0, 0, 500]);
  });

  it('pans along camera axes and rotates the camera top in the expected directions', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 250));
    useStore.setState({ bounds });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);
    const panDistance = bounds.getSize(new THREE.Vector3()).length() / 25;

    const initialCameraPosition = camera.position.clone();
    const initialTarget = viewMocks.controls.target.clone();
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'pan-forward' })));

    expect(camera.position.clone().sub(initialCameraPosition).z).toBeCloseTo(-panDistance);
    expect(viewMocks.controls.target.clone().sub(initialTarget).z).toBeCloseTo(-panDistance);

    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI / 2);
    const initialVerticalPosition = camera.position.clone();
    const initialVerticalTarget = viewMocks.controls.target.clone();
    const expectedVertical = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(panDistance);
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'pan-up' })));

    expect(camera.position.clone().sub(initialVerticalPosition).distanceTo(expectedVertical)).toBeCloseTo(0);
    expect(viewMocks.controls.target.clone().sub(initialVerticalTarget).distanceTo(expectedVertical)).toBeCloseTo(0);

    const initialUp = camera.up.clone();
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'rotate-camera-left' })));
    expect(camera.up.x).toBeLessThan(initialUp.x);
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: 'rotate-camera-right' })));
    expect(camera.up.x).toBeCloseTo(initialUp.x);
    expect(camera.up.y).toBeCloseTo(initialUp.y);
    expect(camera.up.z).toBeCloseTo(initialUp.z);
  });

  it('resets to the selected view with Z up in position and flight modes', () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-10, -20, -30),
      new THREE.Vector3(10, 20, 30),
    );
    useStore.setState({ bounds });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(camera.position.toArray()).toEqual([-10, 0, 0]);
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
    expect(viewMocks.controls.target.toArray()).toEqual([0, 0, 0]);

    act(() => useStore.setState({ controlMode: 'flight' }));
    act(() => window.dispatchEvent(new CustomEvent('view-control-action', { detail: ' ' })));
    expect(camera.position.toArray()).toEqual([-10, 0, 0]);
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
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

      const expectedDistance = importedBounds.getSize(new THREE.Vector3()).z * 2;
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

  it('initializes flight mode to the default speed when selected from navigation', () => {
    const previousElectronAPI = window.electronAPI;
    const setZoom = vi.fn();
    const setControlMode = vi.fn().mockResolvedValue('flight');
    window.electronAPI = { setControlMode };

    try {
      render(<ViewControls zoomRequest={{ value: 180 }} setZoom={setZoom} />);

      act(() => window.dispatchEvent(new CustomEvent('control-mode-requested', { detail: 'flight' })));

      expect(setZoom).toHaveBeenCalledWith(40);
      expect(useStore.getState().controlMode).toBe('flight');
      expect(setControlMode).toHaveBeenCalledWith('flight');
    } finally {
      if (previousElectronAPI === undefined) delete window.electronAPI;
      else window.electronAPI = previousElectronAPI;
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

  it('uses the viewer area as the flight-control bounds', () => {
    useStore.setState({ controlMode: 'flight' });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);

    expect(viewMocks.flyControlsDomElement).toBe(viewerArea);
  });

  it('ignores a pointer release in the viewer when the press started outside it', () => {
    useStore.setState({ controlMode: 'flight' });
    render(<ViewControls zoomRequest={{ value: 180 }} setZoom={vi.fn()} />);

    const pointerUps = vi.fn();
    viewerArea.addEventListener('pointerup', pointerUps);
    document.body.appendChild(viewerArea);
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);

    try {
      fireEvent.pointerDown(sidebar, { pointerId: 1 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
      expect(pointerUps).not.toHaveBeenCalled();

      fireEvent.pointerDown(canvas, { pointerId: 2 });
      fireEvent.pointerUp(canvas, { pointerId: 2 });
      expect(pointerUps).toHaveBeenCalledOnce();
    } finally {
      viewerArea.removeEventListener('pointerup', pointerUps);
      viewerArea.remove();
      sidebar.remove();
    }
  });
});
