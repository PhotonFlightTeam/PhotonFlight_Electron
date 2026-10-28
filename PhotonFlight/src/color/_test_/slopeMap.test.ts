import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import useStore from '../../useStore';
import { applySlopeMapColor } from '../slopeMap';

describe('applySlopeMapColor', () => {
  afterEach(() => {
    useStore.setState({ colors: null });
  });

  it('maps neighborhood slopes to colors and updates the geometry attribute', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.1, 0, 1,
      0.2, 0, 0,
      1, 0, 0,
    ]);
    const geometry = new THREE.BufferGeometry();
    const rgbMinMax = { min: [0, 0, 0] as [number, number, number], max: [1, 0.5, 0.25] as [number, number, number] };
    const normalizedSlope = 10 / 12;

    applySlopeMapColor(geometry, positions, rgbMinMax);

    const expectedColors = new Float32Array([
      normalizedSlope, normalizedSlope * 0.5, normalizedSlope * 0.25,
      normalizedSlope, normalizedSlope * 0.5, normalizedSlope * 0.25,
      normalizedSlope, normalizedSlope * 0.5, normalizedSlope * 0.25,
      0, 0, 0,
    ]);
    expect(useStore.getState().colors).toEqual(expectedColors);
    expect(geometry.getAttribute('color').array).toEqual(expectedColors);
  });

  it('maps an isolated point to the minimum color', () => {
    const positions = new Float32Array([0, 0, 3]);
    const geometry = new THREE.BufferGeometry();
    const min = [0.1, 0.2, 0.3] as [number, number, number];
    const max = [0.9, 0.8, 0.7] as [number, number, number];

    applySlopeMapColor(geometry, positions, { min, max });

    expect(useStore.getState().colors).toEqual(new Float32Array(min));
  });
});
