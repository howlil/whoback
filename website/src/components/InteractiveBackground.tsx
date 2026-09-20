import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

export function InteractiveBackground() {
  const reduceMotion = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);
  const x = useMotionValue(-600);
  const y = useMotionValue(-600);
  const smoothX = useSpring(x, { stiffness: 130, damping: 24, mass: 0.22 });
  const smoothY = useSpring(y, { stiffness: 130, damping: 24, mass: 0.22 });

  useEffect(() => {
    const query = window.matchMedia('(pointer: fine)');
    const updatePointerMode = () => setFinePointer(query.matches);
    updatePointerMode();
    query.addEventListener('change', updatePointerMode);

    if (reduceMotion || !query.matches) {
      return () => query.removeEventListener('change', updatePointerMode);
    }

    const onPointerMove = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      query.removeEventListener('change', updatePointerMode);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [reduceMotion, x, y]);

  return (
    <div className="interactive-background" aria-hidden="true">
      <div className="interactive-background__grid" />
      {finePointer && !reduceMotion && (
        <motion.div
          className="interactive-background__spotlight"
          style={{ x: smoothX, y: smoothY }}
        />
      )}
    </div>
  );
}
