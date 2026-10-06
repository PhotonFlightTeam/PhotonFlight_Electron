import { useState, useEffect, useMemo, useRef } from 'react';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { applyHeightMapColor } from '../color/heightMap';
import { applySlopeMapColor } from '../color/slopeMap';
import { colorCircle } from '../color/colorCircle';
import { colorSquare } from '../color/colorSquare';
import '../css/lasReader.css';
import * as THREE from 'three';
import useStore from '../useStore';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import ViewControls from './ViewControls';

// Point Cloud Renderer Component
const PointCloudViewer = ({ fileUrl, active, pointsRef }) => {
  const [pointData, setPointData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
	// min is the value at the minimum point, max is the val at maximum point
	// NOT to be confused with min and max of RGB Color Space
  const [rgbMinMax, setRgbMinMax] = useState({ min: [0,1,0], max: [1,0,0] });

  // Parses the LiDAR data
  useEffect(() => {
    async function parseLasFile() {
      try {
        setLoading(true);
	      //Load and Parse binary .las/.laz file
        const source = fileUrl instanceof ArrayBuffer ?
        fileUrl.slice(0) : fileUrl;
        const data = await load(source, LASLoader);
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
    <points ref={pointsRef} geometry={geometry} >
      <pointsMaterial 
        size={0.05} // Adjust thickness based on data density
        vertexColors={!!geometry.attributes.color} // Use laser-captured color metrics if available
        sizeAttenuation={true} // Near points appear larger than distant points
      />
    </points>
  );
}


// Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl: initialFileUrl }) {
  const [active, setActive] = useState('base');
  // const [view, setView] = useState('start');
  // const [axis, setAxis] = useState(null);
  const [key, setKey] = useState(0);
  const [fileSource, setFileSource] = useState(initialFileUrl);
  const [zoom, setZoom] = useState(180);
  const canvasRef = useRef();
  const pointsRef = useRef();

  useEffect(() => {
    if (!window.electronAPI) return;

    const offImport = window.electronAPI.onFileImported(async (filePath) => { // Import a .las file and load it into the viewer
      const buffer = await window.electronAPI.readFile(filePath);
      if (buffer) { 
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        setFileSource(arrayBuffer);
        useStore.setState({ colors: null, positions: null});
        setKey(prevKey => prevKey + 1); // Force re-render of PointCloud Viewer
      }
    });

    const offExport = window.electronAPI.onFileExported(async (filePath) => { // Export the current point cloud data to a .las file
      const { positions } = useStore.getState();
      if (!positions) return;

      const encodedLasData = new Uint8Array();
      await window.electronAPI.saveFile(filePath, encodedLasData);
    });

    return () => {
      offImport();
      offExport();
    };
  }, []); // Wtf even is this line dawg. Like Legit. 

  const handleChange = (event) => {
    setActive(event.target.value); 
    useStore.setState({ colors: null }); // Reset colors to trigger re-render
    setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  };

  const onClick = (event, camera) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Points.threshold = 0.5; // Adjust based on your point size/scene scale

    const intersects = raycaster.intersectObject(pointsRef.current);

    if (intersects.length > 0) {
      // The closest intersected point index
      const index = intersects[0].index;
      console.log("Clicked point index:", index);
    }
  };

  function CanvasClickListener({ onClick }) {
    const { camera, gl } = useThree();

    useEffect(() => {
      const handleClick = (event) => onClick(event, camera);
      const canvas = gl.domElement;

      canvas.addEventListener('click', handleClick);
      return () => canvas.removeEventListener('click', handleClick);
    }, [camera, gl, onClick]);

    return null;
  }

  return (
    <div className="las-viewer">
      <Canvas 
      ref={canvasRef}
      camera={{ position: [0, 10, 50], fov: 60 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
        <PointCloudViewer pointsRef={pointsRef} key={key} fileUrl={fileSource} active={active} />
        <CanvasClickListener onClick={onClick} />
        <ViewControls zoom={zoom} setZoom={setZoom} />

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

