import * as THREE from 'three';
import KDBush from 'kdbush';
import useStore from '../useStore';

type RgbMinMax = {
  min: [number, number, number];
  max: [number, number, number];
};

function getSteepestSlopesIndexed(points: Array<number>, searchRadius = 0.25) {
  const n = points.length;
  const steepestSlopes = new Array(n/3).fill(0);

  // Initialize KDBush using the X and Y coordinates for spatial indexing
  const index = new KDBush(n/3);
  for (let i = 0; i < n; i += 3) {
    index.add(points[i], points[i + 1]);
  }
  index.finish();

  for (let i = 0; i < n; i += 3) {
    const [x1, y1, z1] = [points[i], points[i + 1], points[i + 2]];
    let maxSlope = 0;

    // Fast range query targeting neighbors within our horizontal bounding box
    const neighborIndices = index.within(x1, y1, searchRadius);

    for (const j of neighborIndices) {
      if (i === j * 3) continue;

      const [x2, y2, z2] = [points[j * 3], points[j * 3 + 1], points[j * 3 + 2]];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const horizontalDist = Math.hypot(dx, dy);

      const dz = Math.abs(z2 - z1);
      const slope = dz / horizontalDist;

      if (slope > maxSlope && horizontalDist > 0) {
        maxSlope = slope;
      }
    }
    steepestSlopes[i / 3] = maxSlope;
  }

  return steepestSlopes;
}


export function applySlopeMapColor(
  geo: THREE.BufferGeometry,
  positions: Array<number>,
  rgbMinMax: RgbMinMax
): void {

      // Create a color gradient based on slope if no RGB data is present
      const colors = new Float32Array(positions.length);
      let slopes = getSteepestSlopesIndexed(positions);

   
      slopes = slopes.map(val => (val/2) / ((val/2) + 1));
      

      for (let i = 0; i < colors.length; i += 3) { // Set colors based on normalized height
        const slope = slopes[i / 3];
        colors[i] = rgbMinMax.min[0] + (rgbMinMax.max[0] - rgbMinMax.min[0]) * slope;
        colors[i + 1] = rgbMinMax.min[1] + (rgbMinMax.max[1] - rgbMinMax.min[1]) * slope;
        colors[i + 2] = rgbMinMax.min[2] + (rgbMinMax.max[2] - rgbMinMax.min[2]) * slope;
      }

      useStore.setState({ colors: colors }); // Store the generated colors in Zustand state
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }