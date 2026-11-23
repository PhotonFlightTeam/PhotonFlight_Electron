import { useEffect, useRef, useState } from 'react';
import { OrbitControls, FlyControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useStore from '../useStore';
import ViewCube from './ViewCube';

// The point cloud is Z-up (Z = elevation). OrbitControls orbits around camera.up and
// reads it once when it is created, so the camera must be Z-up before that happens.
const WORLD_UP = new THREE.Vector3(0, 0, 1);

// Directions from the target to the camera for each named view (OnShape convention).
export const VIEWS = {
    top: new THREE.Vector3(0, 0, 1),
    bottom: new THREE.Vector3(0, 0, -1),
    front: new THREE.Vector3(0, -1, 0),
    back: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    left: new THREE.Vector3(-1, 0, 0),
};

// Keyboard / sidebar keys for each named view. Space is "Reset view".
const VIEW_KEYS = {
    t: VIEWS.top,
    b: VIEWS.bottom,
    f: VIEWS.front,
    v: VIEWS.back,
    l: VIEWS.left,
    r: VIEWS.right,
    ' ': VIEWS.top,
};

export default function ViewControls({ zoomRequest, setZoom, fileUrl }) {
    const { camera, gl } = useThree();
    // Done during render (not in an effect) so it lands before <OrbitControls> is constructed.
    if (!camera.up.equals(WORLD_UP)) camera.up.copy(WORLD_UP);
    const controlsRef = useRef();
    const isUpdatingFromSlider = useRef(false);
    const [axis, setAxis] = useState(null);
    const controls = useStore((state) => state.controlMode);
    const setControlMode = useStore((state) => state.setControlMode);
    const bounds = useStore((state) => state.bounds);
    const boundsLength = bounds?.getSize(new THREE.Vector3()).length() ?? 0;
    const boundsAtFileChange = useRef(bounds);
    const cameraResetPending = useRef(false);
    const maxDist = boundsLength > 0 ? Math.max(boundsLength * 3, 1) : 1000;
    const minDist = boundsLength > 0 ? Math.max(boundsLength * 0.001, 0.001) : 1;
    // Slider Min/Max
    const maxZoom = 200; // Slider top value
    const minZoom = 10;  // Slider bottom value
    const [speed, setSpeed] = useState(maxDist / 25);
    const [rollSpeed, setRollSpeed] = useState(0.716);

    useEffect(() => {
        const electronAPI = window.electronAPI;
        if (!electronAPI?.onControlModeChanged) return;

        return electronAPI.onControlModeChanged((controlMode) => {
            if (controlMode !== 'flight' && controlMode !== 'position') return;

            if (controlMode === 'flight') {
                setSpeed(maxDist / 25);
                setZoom(40);
            }

            console.log('Control mode changed:', controlMode);
            setControlMode(controlMode);
            void electronAPI.setControlMode(controlMode);
        });
    }, [maxDist, setZoom, setControlMode]);

    useEffect(() => {
        boundsAtFileChange.current = bounds;
        cameraResetPending.current = Boolean(fileUrl);
    }, [fileUrl]);

    useEffect(() => {
        if (!fileUrl || !cameraResetPending.current || !bounds || bounds === boundsAtFileChange.current) return;

        applyViewRef.current(VIEWS.top);
        cameraResetPending.current = false;
    }, [fileUrl, bounds, camera, setZoom]);

    // Helper math to map physical distance to a 10-200 slider value
    const distToZoom = (dist) => maxZoom - (((Math.max(minDist, Math.min(dist, maxDist)) - minDist) / (maxDist - minDist)) * (maxZoom - minZoom));
    const zoomToDist = (z) => minDist + (((maxZoom - Math.max(minZoom, Math.min(z, maxZoom))) / (maxZoom - minZoom)) * (maxDist - minDist));
    const zoomToSpeed = (z) => (maxDist / 5) + (((maxZoom - Math.max(minZoom, Math.min(z, maxZoom))) / (maxZoom - minZoom)) * ((maxDist / 100) - (maxDist / 5)));
    const zoomToRollSpeed = (z) => 4 + (((maxZoom - Math.max(minZoom, Math.min(z, maxZoom))) / (maxZoom - minZoom)) * (0.1 - 4));

    // Distance at which the whole cloud fits on screen.
    const fitDistance = () => {
        if (boundsLength <= 0) return Math.max(camera.position.length(), 1);
        const halfFov = THREE.MathUtils.degToRad((camera.fov ?? 60) / 2);
        const distance = (boundsLength / 2 / Math.sin(halfFov)) * 1.1;
        return Math.min(Math.max(distance, minDist), maxDist);
    };

    // Moves the camera to look at the origin from direction. Shared by the view cube,
    // the view keys, the navigation sidebar and the reset after a new file loads.
    const applyView = (direction) => {
        const dir = direction.clone().normalize();
        // Looking straight down/up makes "up" parallel to the view. Nudge it slightly so
        // north (+Y) stays at the top of the screen and OrbitControls has a valid angle.
        if (Math.abs(dir.z) > 0.9999) dir.set(0, -Math.sign(dir.z) * 1e-3, Math.sign(dir.z)).normalize();

        const distance = fitDistance();
        controlsRef.current?.target?.set(0, 0, 0);
        camera.position.copy(dir.multiplyScalar(distance));
        camera.up.copy(WORLD_UP);
        camera.lookAt(0, 0, 0);
        controlsRef.current?.update();
        if (controls === 'position') setZoom(distToZoom(distance));
    };
    const applyViewRef = useRef(applyView);
    applyViewRef.current = applyView;

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
        if (controls === 'position') {
            if (!controlsRef.current) return;
            const currentDist = camera.position.distanceTo(controlsRef.current.target);
            const targetDist = zoomToDist(zoomRequest.value);

            // Only move the camera if the slider value differs significantly from current view
            if (Math.abs(currentDist - targetDist) > 0.5) {
                const direction = new THREE.Vector3().subVectors(camera.position, controlsRef.current.target).normalize();
                if (direction.lengthSq() === 0) direction.set(0, 0, 1);

                isUpdatingFromSlider.current = true;

                camera.position.copy(controlsRef.current.target).add(direction.multiplyScalar(targetDist));
                controlsRef.current.update();

                isUpdatingFromSlider.current = false;
            }
        } else {
            const targetSpeed = zoomToSpeed(zoomRequest.value);
            const targetRollSpeed = zoomToRollSpeed(zoomRequest.value);
            setSpeed(targetSpeed);
            setRollSpeed(targetRollSpeed);
        }
    }, [zoomRequest, camera, setSpeed, setRollSpeed]);

    useEffect(() => {
        const canvas = gl.domElement;
        if (!canvas) return;
        canvas.tabIndex = 0;
        const focus = () => canvas.focus();
        const capturePointer = (event) => canvas.setPointerCapture(event.pointerId);

        // Returns true if key was a view key (T/B/F/V/L/R/Space) and the view was applied.
        const applyNamedView = (key) => {
            const direction = VIEW_KEYS[key.toLowerCase()];
            if (!direction) return false;
            applyViewRef.current(direction);
            return true;
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

        const panCamera = (direction) => {
            const distance = boundsLength > 0 ? Math.max(boundsLength / 25, 0.1) : 1;
            const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
            const cameraRotation = camera.getWorldQuaternion(new THREE.Quaternion());
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRotation).normalize();
            const vertical = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraRotation).normalize();
            const directions = {
                'pan-forward': forward,
                'pan-backward': forward.clone().negate(),
                'pan-left': right.clone().negate(),
                'pan-right': right,
                'pan-up': vertical,
                'pan-down': vertical.clone().negate(),
            };
            const movement = directions[direction];
            if (!movement) return;

            const offset = movement.multiplyScalar(distance);
            camera.position.add(offset);
            controlsRef.current?.target?.add(offset);
            controlsRef.current?.update();
        };

        const rotateCamera = (direction) => {
            const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
            const angle = direction === 'rotate-camera-left' ? -Math.PI / 12 : Math.PI / 12;
            camera.up.applyAxisAngle(forward, angle).normalize();
            controlsRef.current?.update();
        };

        // Keydown event handler to manage camera controls and view changes
        const handleKeyDown = (event) => {
            if (controls === 'flight') return;
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

            if (applyNamedView(event.key)) {
                if (event.key === ' ') event.preventDefault();
                return;
            }

            switch (event.key.toLowerCase()) {
                case 'x': if (axis === null) setAxis([10,0,0]); break;
                case 'y': if (axis === null) setAxis([0,10,0]); break;
                case 'z': if (axis === null) setAxis([0,0,10]); break;
                case 'arrowup': if (axis !== null) shift(axis); break;
                case 'arrowdown': if (axis !== null) shift(axis.map(num => -1 * num)); break;
                case 'arrowright': if (axis !== null) rotate(axis); break;
                case 'arrowleft': if (axis !== null) rotate(axis.map(num => -1 * num)); break;
            }
        };

        const handleNavigationAction = (event) => {
            const key = event.detail;
            if (key.startsWith('pan-')) {
                panCamera(key);
                return;
            }
            if (key === 'rotate-camera-left' || key === 'rotate-camera-right') {
                rotateCamera(key);
                return;
            }

            const axisVectors = {
                x: [10, 0, 0],
                y: [0, 10, 0],
                z: [0, 0, 10],
            };
            if (axisVectors[key]) {
                setAxis(axisVectors[key]);
                return;
            }

            if (applyNamedView(key)) return;

            handleKeyDown({ key, target: canvas, preventDefault: () => {} });
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
        window.addEventListener('view-control-action', handleNavigationAction);
        if (controls === 'flight') {
            canvas.addEventListener('pointerdown', capturePointer);
        }

        return () => {
            canvas.removeEventListener('click', focus);
            canvas.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('view-control-action', handleNavigationAction);
            canvas.removeEventListener('pointerdown', capturePointer);
        };
    }, [gl, camera, axis, controls, maxDist, minDist, setZoom, boundsLength]);

    const flightControlElement = gl.domElement.closest('.viewer-area')
        ?? gl.domElement.parentElement
        ?? gl.domElement;

    return (
        <>
            {controls === 'position' ? (
                <OrbitControls
                    ref={controlsRef}
                    makeDefault
                    enableDamping
                    maxDistance={maxDist}
                    minDistance={minDist}
                />
            ) : (
                <FlyControls
                    domElement={flightControlElement}
                    movementSpeed={speed}
                    rollSpeed={rollSpeed}
                    dragToLook={true}
                    autoForward={false}
                />
            )}
            <ViewCube onSelectView={applyView} />
        </>
    );
}
