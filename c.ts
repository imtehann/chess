import { useRef } from 'react';
import gsap from 'gsap';

const AnimHand = () => {
  const handRef = useRef();

  const playMoveSequence = (start, end) => {
    const tl = gsap.timeline();
    
    tl.to(handRef.current.position, {
      x: start.x, y: start.y, z: 2, 
      duration: 0.4, ease: "power2.out"
    })
    .to(handRef.current.position, {
      x: end.x, y: end.y, 
      duration: 0.6, ease: "power2.inOut"
    })
    .to(handRef.current.position, {
      z: 5, duration: 0.3, opacity: 0 // Retreat
    });
  };

  return (
    <mesh ref={handRef} position={[-10, 0, 5]}>
      <sprite scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={handTexture} />
      </sprite>
    </mesh>
  );
};