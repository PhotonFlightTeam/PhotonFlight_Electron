import { useEffect, useRef, useState } from 'react';
import { OrbitControls, FlyControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useStore from '../useStore';

export default function ViewControls({ zoomRequest, setZoom, fileUrl }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();
  const isUpdatingFromSlider = useRef(false);
  const [axis, setAxis] = useState(null);
  const [controls, setControls] = useState('position');
  const bounds = useStore((state) => state.bounds);
  const boundsDiagonal = bounds?.getSize(new THREE.Vector3());
  const boundsLength = boundsDiagonal?.length() ?? 0;
  const boundsAtFileChange = useRef(bounds);
  const cameraResetPending = useRef(false);
  const maxDist = boundsLength > 0 ? Math.max(boundsLength * 3, 1) : 1000;
  const minDist = boundsLength > 0 ? Math.max(boundsLength * 0.001, 0.001) : 1;
  // Slider Min/Max
  const maxZoom = 200; // Slider top value
  const minZoom = 10;  // Slider bottom value

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.onControlModeChanged) return;

    return electronAPI.onControlModeChanged((controlMode) => {
      if (controlMode !== 'flight' && controlMode !== 'position') return;

      console.log('Control mode changed:', controlMode);
      setControls(controlMode);
      void electronAPI.setControlMode(controlMode);
    });
  }, []);

  useEffect(() => {
    boundsAtFileChange.current = bounds;
    cameraResetPending.current = Boolean(fileUrl);
  }, [fileUrl]);

  useEffect(() => {
    if (!fileUrl || !cameraResetPending.current || !bounds || bounds === boundsAtFileChange.current) return;

    const distance = Math.max(bounds.getSize(new THREE.Vector3()).z * 2, 1);
    camera.position.set(0, 0, distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    const controls = controlsRef.current;
    if (controls?.target) {
      controls.target.set(0, 0, 0);
      controls.update();
    }

    cameraResetPending.current = false;
    setZoom(distToZoom(distance));
  }, [fileUrl, bounds, camera, setZoom]);

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
  }, [camera, setZoom, maxDist, minDist, controls]);
  
  // Apply camera changes only for explicit slider/button zoom requests.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const currentDist = camera.position.distanceTo(controls.target);
    const targetDist = zoomToDist(zoomRequest.value);
    
    // Only move the camera if the slider value differs significantly from current view
    if (Math.abs(currentDist - targetDist) > 0.5) {
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);

      isUpdatingFromSlider.current = true;

      camera.position.copy(controls.target).add(direction.multiplyScalar(targetDist));
      controls.update();

      isUpdatingFromSlider.current = false;
    }
  }, [zoomRequest, camera]);
  

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;
    canvas.tabIndex = 0;
    const focus = () => canvas.focus();

    // Function to apply a specific view based on position and direction
    const applyView = (pos, dir) => {
      controlsRef.current?.target?.set(0, 0, 0);
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.up.set(dir[0], dir[1], dir[2]);
      camera.lookAt(0, 0, 0);
      controlsRef.current?.update();
      // Update the slider to match the new perspective's distance
      setZoom(distToZoom(camera.position.length()));
    };

    // Function to shift the camera position based on a given vector
    const shift = (pos) => {
      console.log(pos);
      camera.position.x += pos[0];
      camera.position.y += pos[1];
      camera.position.z += pos[2];
    };

    // Function to rotate the camera around the target based on a given vector
    const rotate = (dir) => {
      controlsRef.current.target.x += dir[0];
      controlsRef.current.target.y += dir[1];
      controlsRef.current.target.z += dir[2];
    };

    // Keydown event handler to manage camera controls and view changes
    const handleKeyDown = (event) => {
      if (controls === 'flight') return;
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      switch (event.key.toLowerCase()) {
        case 't': applyView([0, 0, boundsDiagonal.z * 2], [0, 1, 0]); break;
        case 'b': applyView([0, 0, -boundsDiagonal.z * 2], [0, -1, 0]); break;
        case 'f': applyView([boundsDiagonal.x, 0, 0], [0, 0, 1]); break;
        case 'v': applyView([-boundsDiagonal.x, 0, 0], [0, 0, 1]); break;
        case 'l': applyView([0, -boundsDiagonal.y, 0], [0, 0, 1]); break;
        case 'r': applyView([0, boundsDiagonal.y, 0], [0, 0, 1]); break;
        case 'x': if (axis === null) setAxis([10,0,0]); break;
        case 'y': if (axis === null) setAxis([0,10,0]); break;
        case 'z': if (axis === null) setAxis([0,0,10]); break;
        case 'arrowup': if (axis !== null) shift(axis); break;
        case 'arrowdown': if (axis !== null) shift(axis.map(num => -1 * num)); break;
        case 'arrowright': if (axis !== null) rotate(axis); break;
        case 'arrowleft': if (axis !== null) rotate(axis.map(num => -1 * num)); break;
        case ' ': 
          event.preventDefault(); 
          applyView([0, 0, boundsDiagonal.z * 2], [0, 1, 0]);
          break;
      }
    };

    const handleKeyUp = (event) => {
      if (controls === 'flight') return;
      // Reset axis when the key is released
      if (['x', 'y', 'z'].includes(event.key.toLowerCase())) {
        setAxis(null);
      }
    };

    // Add event listeners for click, keydown, and keyup events to the canvas
    canvas.addEventListener('click', focus);
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.removeEventListener('click', focus);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
    };
  }, [gl, camera, axis, controls, maxDist, minDist, setZoom, boundsDiagonal]);

  if (controls === 'position') {
    return <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      maxDistance={maxDist}
      minDistance={minDist}
    />;
  }

  return (
    <FlyControls
      movementSpeed={maxDist / 25}
      rollSpeed={0.3}
      dragToLook
      autoForward={false}
    />
  );
}