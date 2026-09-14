import * as THREE from 'three';
import useStore from '../useStore';

type RgbMinMax = {
  min: [number, number, number];
  max: [number, number, number];
};

export function applyHeightMapColor(
  geo: THREE.BufferGeometry,
  positions: Array<number>,
  rgbMinMax: RgbMinMax
): void {
      // Find minimum and maximum z values for gradient mapping
      let min = positions[2];
      let max = positions[2];
      for (let i = 2; i < positions.length; i += 3) {
        min = Math.min(min, positions[i]);
        max = Math.max(max, positions[i]);
      }


      // Create a color gradient based on height (z-axis) if no RGB data is present
      const colors = new Float32Array(positions.length);
      const heightRange = max - min || 1;
      for (let i = 0; i < colors.length; i += 3) { // Set colors based on normalized height
        const normalizedHeight = (positions[i + 2] - min) / heightRange;
        colors[i] = rgbMinMax.min[0] + (rgbMinMax.max[0] - rgbMinMax.min[0]) * normalizedHeight;
        colors[i + 1] = rgbMinMax.min[1] + (rgbMinMax.max[1] - rgbMinMax.min[1]) * normalizedHeight;
        colors[i + 2] = rgbMinMax.min[2] + (rgbMinMax.max[2] - rgbMinMax.min[2]) * normalizedHeight;
      }
      useStore.setState({ colors: colors }); // Store the generated colors in Zustand state
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }