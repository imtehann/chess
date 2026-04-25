import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import NatureEffects from './NatureEffects';
import PieceBillboard from './PieceBillboard';
import AnimHand from './AnimHand';

export const Board25D = ({ gameState, onMove }) => {
  return (
    <Canvas shadows>
      {/* 2.5D Tilted Camera */}
      <PerspectiveCamera makeDefault position={[0, -8, 8]} rotation={[Math.PI / 4, 0, 0]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} castShadow />

      {/* The Pixel-Art Board */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#4a3b28" /> {/* Placeholder for pixel texture */}
      </mesh>

      {/* Falling Leaves Particles */}
      <NatureEffects theme="autumn" />

      {/* The Animated Move Hand */}
      <AnimHand />

      {/* Render Pieces */}
      {gameState.board().map((row, y) => 
        row.map((square, x) => square && (
          <PieceBillboard 
            key={`${x}-${y}`} 
            type={square.type} 
            color={square.color} 
            position={[x - 3.5, 3.5 - y, 0.1]} 
          />
        ))
      )}
    </Canvas>
  );
};