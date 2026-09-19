import React, { useState, useEffect, useMemo, useRef } from 'react';
import { OrbitControls, GizmoHelper, GizmoViewport, GizmoViewcube } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from './color/heightMap';
import { applySlopeMapColor } from './color/slopeMap';
import * as THREE from 'three';
import useStore from './useStore';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import { breadcrumbsClasses } from '@mui/material/Breadcrumbs';

// Point Cloud Renderer Component
function PointCloudViewer({ fileUrl, active }) {
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
	// min is the value at the minimum point, max is the val at maximum point
	// NOT to be confused with min and max of RGB Color Space
  const [rgbMinMax, setRgbMinMax] = useState({ min: [0,1,0], max: [1,0,0] });

  useEffect(() => {
    async function parseLasFile() {
      try {
        setLoading(true);
	      //Load and Parse binary .las/.laz file
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

// Build optimized Three.js Buffer Geometry using useMemo
  const geometry = useMemo(() => {
    if (!pointData || !pointData.attributes.POSITION) return null;

    const geo = new THREE.BufferGeometry();
// Extract Positions array [x1, y1, z1, x2, y2, z2, ...]
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
  }, [pointData, active, rgbMinMax]);

  if (loading || error || !geometry) return null;  // Handle loading status via standard React UI overhead

  return (
    <points geometry={geometry}>
      <pointsMaterial 
        size={0.05} // Adjust thickness based on data density
        vertexColors={!!pointData.attributes.COLOR_0} // Use laser-captured color metrics if available
        sizeAttenuation={true} // Near points appear larger than distant points
      />
    </points>
  );
}

function ViewControls({ view = 'start', zoom, setZoom, axis = null}) {
  const { camera } = useThree();
  const controlsRef = useRef();
  const isUpdatingFromSlider = useRef(false);

  const maxDist = 1000; // Maximum distance from camera to target
  const minDist = 1;  // Minimum distance from camera to target
  // Slider Min/Max
  const maxZoom = 200; // Slider top value
  const minZoom = 10;  // Slider bottom value

  // Helper math to map physical distance to a 10-200 slider value
  const distToZoom = (dist) => maxZoom - (((Math.max(minDist, Math.min(dist, maxDist)) - minDist) / (maxDist - minDist)) * (maxZoom - minZoom));
  const zoomToDist = (z) => minDist + (((maxZoom - Math.max(minZoom, Math.min(z, maxZoom))) / (maxZoom - minZoom)) * (maxDist - minDist));

  // Sync Slider to Mouse Wheel (OrbitControls internal change)
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onControlChange = () => {
      if (isUpdatingFromSlider.current) return;

      const dist = camera.position.distanceTo(controls.target);
      setZoom(() => distToZoom(dist));
    };

    controls.addEventListener('change', onControlChange);
    return () => controls.removeEventListener('change', onControlChange);
  }, [camera, setZoom]); //RIGHT HERE FIXME
  
  //Sync Slider Camera
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const currentDist = camera.position.distanceTo(controls.target);
    const targetDist = zoomToDist(zoom);
    
    // Only move the camera if the slider value differs significantly from current view
    if (Math.abs(currentDist - targetDist) > 0.5) {
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);

      isUpdatingFromSlider.current = true;

      camera.position.copy(controls.target).add(direction.multiplyScalar(targetDist));
      controls.update();

      isUpdatingFromSlider.current = false;
    }
  }, [zoom, camera]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const applyView = (pos, dir) => {
      controls.target.set(0, 0, 0);
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.up.set(dir[0], dir[1], dir[2]);
      controls.update();
      // Update the slider to match the new perspective's distance
      setZoom(distToZoom(camera.position.distanceTo(controls.target)));
    };

    const shift = (pos) => {
      console.log(pos);
      camera.position.x += pos[0];
      camera.position.y += pos[1];
      camera.position.z += pos[2];
    };

    const rotate = (dir) => {
      controls.target.x += dir[0];
      controls.target.y += dir[1];
      controls.target.z += dir[2];
    };

    switch (view) {
      case 'start': applyView([0, 0, 50], [0, 1, 0]); break;
      case 'topDown': applyView([0, 0, 500], [0, 1, 0]); break;
      case 'bottomUp': applyView([0, 0, -500], [0, -1, 0]); break;
      case 'front': applyView([500, 0, 0], [0, 0, 1]); break;
      case 'back': applyView([-500, 0, 0], [0, 0, 1]); break;
      case 'right': applyView([0, 500, 0], [0, 0, 1]); break;
      case 'left': applyView([0, -500, 0], [0, 0, 1]); break;
      case 'shift': shift(axis); break;
      case 'rotate': rotate(axis); break;
    }
  }, [view, camera, setZoom]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping maxDistance={maxDist} minDistance={minDist}/>;
}

// Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl: initialFileUrl }) {
  const [active, setActive] = useState('base');
  const [view, setView] = useState('start');
  const [axis, setAxis] = useState(null);
  const [key, setKey] = useState(0);
  const [fileSource, setFileSource] = useState(initialFileUrl);
  const [zoom, setZoom] = useState(180);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onFileImported(async (filePath) => {
        const buffer = await window.electronAPI.readFile(filePath);
        if (buffer) {
          const arrayBuffer = buffer.buffer ? buffer.buffer : buffer;
          setFileSource(arrayBuffer);
          useStore.setState({ colors: null, positions: null }); 
          setKey(prevKey => prevKey + 1); 
        }
      });

      window.electronAPI.onFileExported(async (filePath) => {
        const { positions } = useStore.getState();
        if (!positions) return;

        const encodedLasData = new Uint8Array(); 
        await window.electronAPI.saveFile(filePath, encodedLasData);
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      console.log(event.key);
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      switch (event.key.toLowerCase()) {
        case 't': setView('topDown'); break;
        case 'b': setView('bottomUp'); break;
        case 'f': setView('front'); break;
        case 'v': setView('back'); break;
        case 'l': setView('left'); break;
        case 'r': setView('right'); break;
        case 'x': if (axis === null) setAxis([10,0,0]); break;
        case 'y': if (axis === null) setAxis([0,10,0]); break;
        case 'z': if (axis === null) setAxis([0,0,10]); break;
        case 'arrowup': if (axis !== null) setView('shift'); if (axis.every(num => num <= 0)) setAxis(prev => prev?.map(value => -1 * value)); break;
        case 'arrowdown': if (axis !== null) setView('shift'); if (axis.every(num => num >= 0)) setAxis(prev => prev?.map(value => -1 * value)); break;
        case 'arrowright': if (axis !== null) setView('rotate'); if (axis.every(num => num <= 0)) setAxis(prev => prev?.map(value => -1 * value)); break;
        case 'arrowleft': if (axis !== null) setView('rotate'); if (axis.every(num => num >= 0)) setAxis(prev => prev?.map(value => -1 * value)); break;
        case ' ': 
          event.preventDefault(); 
          setView('start'); 
          break;
      }
    };

    const handleKeyUp = (event) => {
      if (['x', 'y', 'z'].includes(event.key.toLowerCase())) {
        setAxis(null);
      }

      if(['arrowup', 'arrowdown', 'arrowright', 'arrowleft'].includes(event.key.toLowerCase())){
        setView("");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [axis, view]); 

  const handleChange = (event) => {
    setActive(event.target.value); 
    useStore.setState({ colors: null }); // Reset colors to trigger re-render
    setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  };


  return (
    <div style={{ width: '100vw', height: '100vh', background: '#dbd7d7' }}>
      <Canvas camera={{ position: [0, 10, 50], fov: 60 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
        <PointCloudViewer key={key} fileUrl={fileSource} active={active} />
        <ViewControls view={view} zoom={zoom} setZoom={setZoom} axis={axis} />

        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ff3653', '#8adb00', '#2c8fff']} labelColor="white" />
        </GizmoHelper>
      </Canvas>

     {/* UI Box Positioning and Styling */}
	  <Box sx={{ 
		minWidth: 150, 
		position: 'absolute', 
  		top: '20px',
  		left: '20px',
  		zIndex: 10,
  		backgroundColor: 'rgba(255, 255, 255, 0.9)', // Solid backdrop for readability
  		borderRadius: '8px', // Rounded corners to match standard UI
  		padding: '5px' // Slight padding around the input
	  }}>
	  <FormControl fullWidth>
	  <InputLabel id="View Color Selection">View Color</InputLabel>
	  <Select
	  labelId="View Label"
	  id="View Selection"
	  value={active}
	  label="View Color"
	  onChange={handleChange}
	  >
	  <MenuItem value={'base'}>Base</MenuItem>
	  <MenuItem value={'height'}>Height</MenuItem>
	  <MenuItem value={'slope'}>Slope</MenuItem>
	  </Select>
	  </FormControl>
	  </Box>
    <Box sx={{
        position: 'absolute',
        top: '120px',
        left: '20px',
        height: 250,
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '8px',
        padding: '15px 5px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div 
  onClick={() => setZoom(prev => Math.min(prev + 10, 200))}
  style={{ marginBottom: '15px', fontWeight: 'bold', color: '#555', cursor: 'pointer', fontSize: '20px', userSelect: 'none' }}
>
  +
</div>
        <Slider
          orientation="vertical"
          value={zoom}
          min={10}
          max={200}
          onChange={(event, newValue) => setZoom(newValue)}
          aria-label="Camera Zoom"
        />
    <div 
  onClick={() => setZoom(prev => Math.max(prev - 10, 10))}
  style={{ marginTop: '15px', fontWeight: 'bold', color: '#555', cursor: 'pointer', fontSize: '24px', userSelect: 'none', lineHeight: '10px' }}
>
  -
</div>
      </Box>
    </div>
  );
}

// Extracted button styling 
const btnStyle = {
  padding: '8px 16px',
  background: '#ffffff',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  marginRight: '5px',
  marginBottom: '5px'
};
