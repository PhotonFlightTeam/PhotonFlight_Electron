import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from '../color/heightMap';
import { applySlopeMapColor } from '../color/slopeMap';
import { colorCircle } from '../color/colorCircle';
import { colorSquare } from '../color/colorSquare';
import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import useStore from '../useStore';


// Point Cloud Renderer Component
export default function PointCloudViewer({ fileUrl, active, pointsRef }) {
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
	// min is the value at the minimum point, max is the val at maximum point
	// NOT to be confused with min and max of RGB Color Space
  const [rgbMinMax, setRgbMinMax] = useState({ min: useStore.getState().min, max: useStore.getState().max });

  // Parses the LiDAR data
  useEffect(() => {
    let cancelled = false;

    if (!fileUrl) {
      setPointData(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function parseLasFile() {
      try {
        setLoading(true);
	      setPointData(null);
	      //Load and Parse binary .las/.laz file
        const source = fileUrl instanceof ArrayBuffer ? fileUrl.slice(0) : fileUrl;
        const data = await load(source, LASLoader);
        if (cancelled) return;
        setPointData(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to parse LAS file:", err);
        setError("Error parsing LiDAR file format.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    parseLasFile();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);


  // Build Three.js Buffer Geometry using useMemo
  const geometry = useMemo(() => {
    // Ensures that point data exists. 
    if (!pointData || !pointData.attributes.POSITION) return null;

    const geo = new THREE.BufferGeometry();
    // Extract Positions array [x1, y1, z1, x2, y2, z2, ...]
    // Store the position in global state
    const positions = pointData.attributes.POSITION.value;
    useStore.setState({ positions: positions });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Check which color mode the program is set to
    if (useStore.getState().colors !== null) {
	    // Handle RGB colors if they exist in the point cloud attributes
      geo.setAttribute('color', new THREE.BufferAttribute(useStore.getState().colors, 3));
    } else if (pointData.attributes.COLOR_0 && active === 'base') {
      const sourceColors = pointData.attributes.COLOR_0.value;
      const colors = new Float32Array((sourceColors.length / 4) * 3);
      for (let sourceIndex = 0, colorIndex = 0; sourceIndex < sourceColors.length; sourceIndex += 4) {
        colors[colorIndex++] = sourceColors[sourceIndex] / 255;
        colors[colorIndex++] = sourceColors[sourceIndex + 1] / 255;
        colors[colorIndex++] = sourceColors[sourceIndex + 2] / 255;
      }

      // Set color value for attribute and global state
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      useStore.setState({ colors: colors });

      // Examples uses of the color functions
      colorCircle(geo, [322289, 4262576, 0], 50, [1, 0, 0]);
      colorSquare(geo, [322389, 4262676, 0], 50, 50, [0, 0, 1]);
    } else { // If no RGB data or not active default is by slope gradient mapping
      if (active === 'height') {
        applyHeightMapColor(geo, positions, rgbMinMax);
      } else if (active === 'slope') {
        applySlopeMapColor(geo, positions, rgbMinMax);
      }
    }
	   // Center the geometry so it initializes directly in front of the camera bounds
    geo.computeBoundingSphere();
    geo.center();

    return geo;
  }, [pointData, active, rgbMinMax]);

  if (!fileUrl || loading || error || !geometry) return null;

  return (
    <points ref={pointsRef} geometry={geometry} >
      <pointsMaterial 
        size={0.05} // Adjust thickness based on data density
        vertexColors={!!geometry.attributes.color} // Use laser-captured color metrics if available
        sizeAttenuation={true} // Near points appear larger than distant points
      />
    </points>
  );
}
