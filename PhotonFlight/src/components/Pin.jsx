import { Billboard } from '@react-three/drei';
import { MapPin } from 'lucide-react';
import useStore from '../useStore';
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import React from 'react';
import { Html } from '@react-three/drei';

export default function PinTool({ pointsRef, activeTool }) {
    const { camera, gl } = useThree();
    const [pinPoints, setPinPoints] = useState([]);

    const onClick = (event, canvas, camera) => {
        if (activeTool !== 'Pin') return;
        
        //console.log("Click event:", event);
        const rect = canvas.getBoundingClientRect();

        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        raycaster.params.Points.threshold = 0.5; // Adjust based on your point size/scene scale

        const intersects = raycaster.intersectObject(pointsRef.current);
        const points = useStore.getState().positions;

        if (intersects.length > 0) {
            const index = intersects[0].index * 3;

            let measures = useStore.getState().pinpoints ? useStore.getState().pinpoints : [];
            measures.push(points[index]);
            measures.push(points[index + 1]);
            measures.push(points[index + 2]);

            useStore.setState({ pinpoints: measures });

            console.log("Updated pinpoints: ", measures);

            measures = Array.from(
                { length: Math.ceil(measures.length / 3) },
                (_, index) => new THREE.Vector3(
                    measures[index * 3],
                    measures[index * 3 + 1],
                    measures[index * 3 + 2]
                )
            );

            setPinPoints(measures);
            
        }
    };


    const onKeyDown = (event) => {
        if (activeTool !== 'Pin') return;
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        if (event.key.toLowerCase() === 'd') {
            setPinPoints([]);
            useStore.setState({ pinpoints: [] });
        }
    }

    useEffect(() => {
        const canvas = gl.domElement;
        const handleClick = (event) => onClick(event, canvas, camera);
        const handleKeyDown = (event) => onKeyDown(event);
      
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('keydown', handleKeyDown);

        return () => {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('keydown', handleKeyDown);
        };
    }, [camera, gl, onClick]);


    return(
        <>
            {pinPoints.map((point, index) => (
                <React.Fragment key={index}>
                    <mesh position={point}>
                        <sphereGeometry args={[0.5, 16, 16]} />
                        <meshStandardMaterial color="red" />
                    </mesh>
                    <Html position={point} center>
                        <MapPin color="red" size={20} />
                    </Html>
                </React.Fragment>
            ))}
        </>
    );
}