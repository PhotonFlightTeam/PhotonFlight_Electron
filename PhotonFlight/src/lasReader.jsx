import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from './color/heightMap';
import { applySlopeMapColor } from './color/slopeMap';
import * as THREE from 'three';
import useStore from './useStore';


import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';


// Point Cloud Renderer Component
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

    parseLasFile();
  }, [fileUrl]);

  // Build the optimized Three.js Buffer Geometry using useMemo
  const geometry = useMemo(() => {
    if (!pointData || !pointData.attributes.POSITION) return null;

    const geo = new THREE.BufferGeometry();
    
    // Extract positions array [x1, y1, z1, x2, y2, z2, ...] 
    const positions = pointData.attributes.POSITION.value;
    useStore.setState({ positions: positions });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));


    if (pointData.attributes.COLOR_0 && active === 'base') {
      const colors = pointData.attributes.COLOR_0.value;
      // Normalize values if they are 16-bit integers instead of floats (0.0 - 1.0)
      const normalizedColors = pointData.attributes.COLOR_0.type === 5123 
        ? Float32Array.from(colors, v => v / 65535) 
        : colors;
        
      geo.setAttribute('color', new THREE.BufferAttribute(normalizedColors, pointData.attributes.COLOR_0.size));
      useStore.setState({ colors: normalizedColors });
    } else if (useStore.getState().colors !== null) {
      // Handle RGB colors if they exist in the point cloud attributes
      geo.setAttribute('color', new THREE.BufferAttribute(useStore.getState().colors, 3));
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

function ViewControls({ view = 'start' }) {
  const { camera } = useThree();
  const controlsRef = useRef();

  // Sets the position and up direction of the camera
  const setView = ({ position, direction }) => {
    if (!controlsRef.current) return;

    // Reset the target focus to the center of the scene
    controlsRef.current.target.set(0, 0, 0);

    // Adjust the position of the camera
    camera.position.set(position[0], position[1], position[2]);

    // Adjust the cameras up vector (direction of top of screen)
    camera.up.set(direction[0], direction[1], direction[2]);

    // Force OrbitControls to register the new positioning
    controlsRef.current.update();
  };

  return (
    <>
      <OrbitControls ref={controlsRef} makeDefault enableDamping/>
      {/* Direction must be perpendicular to position, if not it sets it to default*/}
      {view === 'start' && setView({ position: [0, 0, 50], direction: [0, 1, 0] })}
      {view === 'topDown' && setView({ position: [0, 0, 500], direction: [0, 1, 0] })}
      {view === 'bottomUp' && setView({ position: [0, 0, -500], direction: [0, -1, 0] })}
      {view === 'front' && setView({ position: [500, 0, 0], direction: [0, 0, 1] })}
      {view === 'back' && setView({ position: [-500, 0, 0], direction: [0, 0, 1] })}
      {view === 'right' && setView({ position: [0, 500, 0], direction: [0, 0, 1] })}
      {view === 'left' && setView({ position: [0, -500, 0], direction: [0, 0, 1] })}
    </>
    
  );
}


// Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl }) {
  const [active, setActive] = useState('base');
  const [view, setView] = useState('start');
  const [key, setKey] = useState(0);

  const handleChange = (event) => {
    setActive(event.target.value);
    useStore.setState({ colors: null }); // Reset colors to trigger re-render
    setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  };

  // const toggleActiveColor = (activeColor) => {
  //   setIsActive(activeColor);
  //   useStore.setState({ colors: null }); // Reset colors to trigger re-render
  //   setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  // };

  const setNewView = (newView) => {
    setView(newView);
    setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#dbd7d7' }}>
      <Canvas camera={{ position: [0, 10, 50], fov: 60 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
    
        <PointCloudViewer key={key} fileUrl={fileUrl} active={active} />
      
        {/* Allows users to rotate, pan, and zoom around the point map smoothly */}
        <ViewControls view={view} />

      </Canvas>
      {/* Button that controls manner in which points are colored */}
      <Box sx={{ minWidth: 120, position: 'absolute', bottom: '10px', left: '5%', zIndex: 10 }}>
        <FormControl fullWidth>
          <InputLabel id="View Color Selection">View Color</InputLabel>
          <Select
            labelId="View Label"
            id="View Selection"
            value={active}
            label="View"
            onChange={handleChange}
          >
            <MenuItem value={'base'}>Base</MenuItem>
            <MenuItem value={'height'}>Height</MenuItem>
            <MenuItem value={'slope'}>Slope</MenuItem>
          </Select>
        </FormControl>
      </Box>
      {/* Buttons for setting orientation of camera FIXME- CSS/react component needs changed*/}
      <div style={{ position: 'absolute', top: '10px', left: '5%', zIndex: 10 }}>
          <button onClick={() => setNewView('topDown')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Top-Down View
          </button>

          <button onClick={() => setNewView('bottomUp')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Bottom-Up View
          </button>

          <button onClick={() => setNewView('start')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reset View
          </button>

          <button onClick={() => setNewView('front')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Front View
          </button>

          <button onClick={() => setNewView('back')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Back View
          </button>

          <button onClick={() => setNewView('left')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Left View
          </button>

          <button onClick={() => setNewView('right')}
            style={{
              padding: '8px 16px',
              background: '#ffffff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Right View
          </button>
        </div>
    </div>
  );
}
