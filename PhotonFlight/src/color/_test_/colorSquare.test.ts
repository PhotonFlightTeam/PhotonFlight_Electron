import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import useStore from '../../useStore';
import { colorSquare } from '../colorSquare';

describe('colorSquare', () => {
  afterEach(() => {
    useStore.setState({ colors: null, positions: null });
  });

  it('colors points strictly inside the rectangle and updates the geometry attribute', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.4, -0.3, 0,
      0.5, 0, 0,
      0, 0.5, 0,
    ]);
    const colors = new Float32Array(positions.length);
    const geometry = new THREE.BufferGeometry();
    useStore.setState({ positions, colors });

    colorSquare(geometry, [0, 0, 0], 0.5, 0.5, [0.2, 0.4, 0.8]);

    const expectedColors = new Float32Array([
      0.2, 0.4, 0.8,
      0.2, 0.4, 0.8,
      0, 0, 0,
      0, 0, 0,
    ]);
    expect(useStore.getState().colors).toEqual(expectedColors);
    expect(geometry.getAttribute('color').array).toEqual(expectedColors);
  });

  it('does not add a geometry attribute when positions are unavailable', () => {
    const geometry = new THREE.BufferGeometry();
    const colors = new Float32Array([0, 0, 0]);
    useStore.setState({ positions: null, colors });

    colorSquare(geometry, [0, 0, 0], 1, 1, [1, 0, 0]);

    expect(geometry.getAttribute('color')).toBeUndefined();
    expect(useStore.getState().colors).toBe(colors);
  });
});
