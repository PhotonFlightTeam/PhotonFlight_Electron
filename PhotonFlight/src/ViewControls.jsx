import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function ViewControls({ view = 'start', zoom, setZoom, axis = null}) {
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
  }, [camera, setZoom]);
  
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