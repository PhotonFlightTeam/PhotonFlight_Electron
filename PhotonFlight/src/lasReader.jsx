import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import * as THREE from 'three';
//import { QuickMeasure } from 'react-three-quick-measure'


// 1. Point Cloud Renderer Component
function PointCloudViewer({ fileUrl, active }) {
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // min is the value value at the minimum point, and max is the value at the maximum point. 
  // Not the minimum and maximum values of the RGB color space
  const [rgbMinMax, setRgbMinMax] = useState({ min: [0,1,0], max: [1,0,0] });

  useEffect(() => {
    async function parseLasFile() {
      try {
        setLoading(true);
        // Load and parse the binary .las/.laz file
        const data = await load(fileUrl, LASLoader);
        setPointData(data);
        setError(null);
      } catch (err) {
        console.error("Failed to parse LAS file:", err);
        setError("Error parsing LiDAR file format.");
      } finally {
        setLoading(false);
      }
    }

    if (fileUrl) parseLasFile();
  }, [fileUrl]);

  // 2. Build the optimized Three.js Buffer Geometry using useMemo
  const geometry = useMemo(() => {
    if (!pointData || !pointData.attributes.POSITION) return null;

    const geo = new THREE.BufferGeometry();
    
    // Extract positions array [x1, y1, z1, x2, y2, z2, ...]
    const positions = pointData.attributes.POSITION.value;
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));


    // Handle RGB colors if they exist in the point cloud attributes
    if (pointData.attributes.COLOR_0 && active) {
      const colors = pointData.attributes.COLOR_0.value;
      // Normalize values if they are 16-bit integers instead of floats (0.0 - 1.0)
      const normalizedColors = pointData.attributes.COLOR_0.type === 5123 
        ? Float32Array.from(colors, v => v / 65535) 
        : colors;
        
      geo.setAttribute('color', new THREE.BufferAttribute(normalizedColors, pointData.attributes.COLOR_0.size));
    }
    else {
      // Find minimum and maximum z values for gradient mapping
      let min = Infinity;
      let max = -Infinity;
      for (let i = 2; i < positions.length; i += 3) {
        min = Math.min(min, positions[i]);
        max = Math.max(max, positions[i]);
      }


      // Create a color gradient based on height (z-axis) if no RGB data is present
      const colors = new Float32Array(positions.length);
      const heightRange = max - min || 1;
      for (let i = 0; i < colors.length; i += 3) {
        const normalizedHeight = (positions[i + 2] - min) / heightRange;
        colors[i] = rgbMinMax.min[0] + (rgbMinMax.max[0] - rgbMinMax.min[0]) * normalizedHeight;
        colors[i + 1] = rgbMinMax.min[1] + (rgbMinMax.max[1] - rgbMinMax.min[1]) * normalizedHeight;
        colors[i + 2] = rgbMinMax.min[2] + (rgbMinMax.max[2] - rgbMinMax.min[2]) * normalizedHeight;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    // Center the geometry so it initializes directly in front of the camera bounds
    geo.computeBoundingSphere();
    geo.center();

    return geo;
  }, [pointData]);

  if (loading) return null; // Handle loading status via standard React UI overhead
  if (error) return null;
  if (!geometry) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial 
        size={0.05}                      // Adjust thickness based on data density
        vertexColors={!!pointData.attributes.COLOR_0} // Use laser-captured color metrics if available
        sizeAttenuation={true}           // Near points appear larger than distant points
      />
    </points>
  );
}

// 3. Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl }) {
  const [isActive, setIsActive] = useState(false);
  const [key, setKey] = useState(0);

  const toggleActive = () => {
    setIsActive(!isActive);
    setKey(prevKey => prevKey + 1);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#dbd7d7' }}>
      <Canvas camera={{ position: [0, 10, 50], fov: 60 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
    
        <PointCloudViewer key={key} fileUrl={fileUrl} active={isActive} />
      
        
        
        {/* Allows users to rotate, pan, and zoom around the point map smoothly */}
        <OrbitControls makeDefault enableDamping />

        
      </Canvas>
      {/* Button that controls manner in which points are colored */}
      <button style={{ position: 'absolute', bottom: '10px', left: '5%' }} onClick={toggleActive}>Toggle View</button>
    </div>
  );
}
