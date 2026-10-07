import { Line, Billboard, Text } from '@react-three/drei';
import useStore from '../useStore';
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function MeasureTool({ pointsRef }) {
    const { camera, gl } = useThree();
    const [measurePoints, setMeasurePoints] = useState([]);
    const [segments, setSegments] = useState([]);

    const onClick = (event, canvas, camera) => {
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

            let measures = useStore.getState().measures ? useStore.getState().measures : [];
            measures.push(points[index]);
            measures.push(points[index + 1]);
            measures.push(points[index + 2]);

            useStore.setState({ measures: measures });

            console.log("Updated measures:", measures);

            measures = Array.from(
                { length: Math.ceil(measures.length / 3) },
                (_, index) => new THREE.Vector3(
                    measures[index * 3],
                    measures[index * 3 + 1],
                    measures[index * 3 + 2]
                )
            );

            setMeasurePoints(measures);

            setSegments(measures.slice(1).map((end, index) => {
                const start = measures[index];

                return {
                    index: index,
                    midpoint: start.clone().add(end).multiplyScalar(0.5),
                    length: start.distanceTo(end),
                }
            }));
            
        }
    };

    useEffect(() => {
        const canvas = gl.domElement;
        const handleClick = (event) => onClick(event, canvas, camera);
      
        canvas.addEventListener('click', handleClick);
        return () => canvas.removeEventListener('click', handleClick);
    }, [camera, gl, onClick]);


    return(
        <>
            
            {measurePoints.length >= 2 && (
                <Line points={measurePoints} color="red" lineWidth={1} />
            )}
            
            <Text
                visible={false}
            >
                0123456789.
            </Text>

            {segments.map(({ index, midpoint, length }) => (
                <Billboard key={index} position={midpoint}>
                    <Text
                        fontSize={3}
                        color="red"
                        anchorX="center"
                        anchorY="middle"
                    >
                        {length.toFixed(2)}
                    </Text>
                </Billboard>
                
            ))}
        </>
    );
}