import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import useStore from '../../useStore';
import { applyHeightMapColor } from '../heightMap';

describe('applyHeightMapColor', () => {
  afterEach(() => {
    useStore.setState({ colors: null });
  });

  it('maps the minimum and maximum heights to the color range endpoints', () => {
    const positions = new Float32Array([
      0, 0, 10,
      1, 0, 20,
      2, 0, 30,
    ]);
    const geometry = new THREE.BufferGeometry();
    const rgbMinMax = { min: [0, 0.2, 0.4] as [number, number, number], max: [1, 0.6, 0.8] as [number, number, number] };

    applyHeightMapColor(geometry, positions, rgbMinMax);

    const expectedColors = new Float32Array([
      0, 0.2, 0.4,
      0.5, 0.4, 0.6,
      1, 0.6, 0.8,
    ]);
    expect(useStore.getState().colors).toEqual(expectedColors);
    expect(geometry.getAttribute('color').array).toEqual(expectedColors);
  });

  it('assigns the minimum color when every point has the same height', () => {
    const positions = new Float32Array([
      0, 0, 5,
      1, 0, 5,
    ]);
    const geometry = new THREE.BufferGeometry();
    const min = [0.1, 0.2, 0.3] as [number, number, number];
    const max = [0.9, 0.8, 0.7] as [number, number, number];

    applyHeightMapColor(geometry, positions, { min, max });

    expect(useStore.getState().colors).toEqual(new Float32Array([
      ...min,
      ...min,
    ]));
  });
});
