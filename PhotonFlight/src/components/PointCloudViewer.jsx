import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from '../color/heightMap';
import { applySlopeMapColor } from '../color/slopeMap';
import { Grid } from '@react-three/drei';
import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import useStore from '../useStore';
import { usePointCloudTheme } from '../theme/pointCloudTheme';


// Point Cloud Renderer Component
export default function PointCloudViewer({ fileUrl, active, pointsRef }) {
  const { mode } = usePointCloudTheme();
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [geo, setGeo] = useState([]) 
	// min is the value at the minimum point, max is the val at maximum point
	// NOT to be confused with min and max of RGB Color Space
  const [rgbMinMax, setRgbMinMax] = useState({ min: useStore.getState().min, max: useStore.getState().max });
  const setAllPointCloudColors = useStore((state) => state.setAllPointCloudColors)
  const setPositions = useStore((state) => state.setPositions)
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
  useEffect(() => {
    if (pointData && pointData.attributes.POSITION) {
      const geo = new THREE.BufferGeometry();
      const positions = pointData.attributes.POSITION.value;
      setPositions(positions);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      if (active === 'base') {
        const baseColor = mode === 'light'
          ? [16 / 255, 42 / 255, 67 / 255]
          : [1, 1, 1];
        setAllPointCloudColors(baseColor);
        const baseColors = useStore.getState().colors;
        geo.setAttribute('color', new THREE.BufferAttribute(baseColors, 3));
      } else if (active === 'height') {
        applyHeightMapColor(geo, positions, rgbMinMax);
      } else if (active === 'slope') {
        applySlopeMapColor(geo, positions, rgbMinMax);
      } else {
        geo.deleteAttribute('color');
      }

      geo.computeBoundingSphere();
      geo.center();
      geo.computeBoundingBox();
      
      setGeo(geo)
    } else {
      setGeo([])
    } 
  }, [pointData, active, rgbMinMax, mode]);

    if (!fileUrl || loading || error || !geo.isBufferGeometry) return null;

  const bounds = geo.boundingBox;
  const cloudHeight = bounds.max.z - bounds.min.z;
  const floorZ = bounds.min.z - Math.max(1, cloudHeight * 0.04);
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, 1);
  const cellSize = 10 ** Math.floor(Math.log10(span / 20));

  return (
    <>
      {/* drei's Grid lies flat for Y-up; this scene is Z-up, so stand it on Z */}
      <group position={[0, 0, floorZ]} rotation={[Math.PI / 2, 0, 0]}>
        <Grid
          args={[100, 100]}
          cellSize={cellSize}
          cellThickness={0.6}
          cellColor={mode === 'light' ? '#a3a3a3' : '#4f4f4f'}
          sectionSize={cellSize * 10}
          sectionThickness={1}
          sectionColor={mode === 'light' ? '#7f7f7f' : '#6b6b6b'}
          fadeDistance={span * 4}
          fadeStrength={1}
          infiniteGrid
          renderOrder={-1}
        />
      </group>
      <points ref={pointsRef} geometry={geo} >
        <pointsMaterial
          color={geo.attributes?.color ? '#ffffff' : mode === 'light' ? '#102a43' : '#eaf6ff'}
          size={0.05} // Adjust thickness based on data density
          vertexColors={!!geo.attributes?.color} // Use laser-captured color metrics if available
          sizeAttenuation={true} // Near points appear larger than distant points
        />
      </points>
    </>
  );
}
