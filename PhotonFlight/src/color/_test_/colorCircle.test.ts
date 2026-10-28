import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import useStore from '../../useStore';
import { colorCircle } from '../colorCircle';

describe('colorCircle', () => {
  afterEach(() => {
    useStore.setState({ colors: null, positions: null });
  });

  it('colors points strictly inside the radius and updates the geometry attribute', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.3, 0.4, 0,
      0.5, 0, 0,
    ]);
    const colors = new Float32Array(positions.length);
    const geometry = new THREE.BufferGeometry();
    useStore.setState({ positions, colors });

    colorCircle(geometry, [0, 0, 0], 0.5, [1, 0.25, 0.75]);

    const expectedColors = new Float32Array([
      1, 0.25, 0.75,
      1, 0.25, 0.75,
      0, 0, 0,
    ]);
    expect(useStore.getState().colors).toEqual(expectedColors);
    expect(geometry.getAttribute('color').array).toEqual(expectedColors);
  });

  it('leaves state and geometry unchanged when positions or colors are unavailable', () => {
    const geometry = new THREE.BufferGeometry();
    useStore.setState({ positions: null, colors: new Float32Array([0, 0, 0]) });

    colorCircle(geometry, [0, 0, 0], 1, [1, 0, 0]);

    expect(geometry.getAttribute('color')).toBeUndefined();
    expect(useStore.getState().colors).toEqual(new Float32Array([0, 0, 0]));
  });
});
