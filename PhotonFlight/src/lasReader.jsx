import { useState, useEffect, useMemo, useRef } from 'react';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from './color/heightMap';
import { applySlopeMapColor } from './color/slopeMap';
import { colorCircle } from './color/colorCircle';
import { colorSquare } from './color/colorSquare';
import './lasReader.css';
import * as THREE from 'three';
import useStore from './useStore';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import ViewControls from './ViewControls';

// Point Cloud Renderer Component
const PointCloudViewer = ({ fileUrl, active }) => {
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
	// min is the value at the minimum point, max is the val at maximum point
	// NOT to be confused with min and max of RGB Color Space
  const [rgbMinMax, setRgbMinMax] = useState({ min: [0,1,0], max: [1,0,0] });
  const pointsRef = useRef();

  const handleClick = (event) => {
    // Prevent the click from bleeding through to objects behind it
    event.stopPropagation();
    // R3F automatically computes intersections and sorts them by proximity
    const intersects = event.intersections;
    
    if (intersects && intersects.length > 0) {
      // The first element is always the closest point to the click ray
      const closestIntersect = intersects[0];
      //const pointIndex = closestIntersect.index;
      const pointPosition = closestIntersect.point;

      console.log(pointPosition);
      colorCircle(pointsRef.current.geometry, [pointPosition.x, pointPosition.y, pointPosition.z], 5, [1,1,0]);

      pointsRef.key = pointsRef.key + 1;
    }
  };

  // Parses the LiDAR data
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
      const colors = pointData.attributes.COLOR_0.value;
      // Normalize values if they are 16-bit integers instead of floats (0.0 - 1.0)
      const normalizedColors = pointData.attributes.COLOR_0.type === 5123 
        ? Float32Array.from(colors, v => v / 65535) 
        : colors;
      // Structure from file is rgba removes a
      const remove4s = normalizedColors.filter((_, index) => (index + 1) % 4 !== 0);
        
      // Set color value for attribute and global state
      geo.setAttribute('color', new THREE.BufferAttribute(remove4s, 3));
      useStore.setState({ colors: remove4s });

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

  if (loading || error || !geometry) return null;  // Handle loading status via standard React UI overhead


  return (
    <points 
    ref={pointsRef} 
    geometry={geometry}
    onPointerDown={handleClick}>
      <pointsMaterial 
        size={0.05} // Adjust thickness based on data density
        vertexColors={!!pointData.attributes.COLOR_0} // Use laser-captured color metrics if available
        sizeAttenuation={true} // Near points appear larger than distant points
      />
    </points>
  );
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
    <div className="las-viewer">
      <Canvas 
      camera={{ position: [0, 10, 50], fov: 60 }}
      raycaster={{ params: { Points: { threshold: 0.1 } } }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
        <PointCloudViewer key={key} fileUrl={fileSource} active={active} />
        <ViewControls view={view} zoom={zoom} setZoom={setZoom} axis={axis} />

        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ff3653', '#8adb00', '#2c8fff']} labelColor="white" />
        </GizmoHelper>
      </Canvas>

      <Box className="view-color-box">
        <FormControl fullWidth>
          <InputLabel id="View Color Selection">View Color</InputLabel>
          
          <Select
            labelId="View Label"
            id="View Selection"
            value={active}
            label="View Color"
            onChange={handleChange}>

            <MenuItem value={'base'}>Base</MenuItem>
            <MenuItem value={'height'}>Height</MenuItem>
            <MenuItem value={'slope'}>Slope</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box className="zoom-box">
        <div 
          onClick={() => setZoom(prev => Math.min(prev + 10, 200))}
          className="zoom-in">
          +
        </div>
        <Slider
          orientation="vertical"
          value={zoom}
          min={10}
          max={200}
          onChange={(event, newValue) => setZoom(newValue)}
          aria-label="Camera Zoom" />
        <div 
          onClick={() => setZoom(prev => Math.max(prev - 10, 10))}
          className="zoom-out">
          -
        </div>
      </Box>
    </div>
  );
}

