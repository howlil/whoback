import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { useEffect, useState } from 'react';

export function InteractiveBackground() {
  const reduceMotion = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  const cursorX = useMotionValue(-600);
  const cursorY = useMotionValue(-600);
  const driftX = useMotionValue(0);
  const driftY = useMotionValue(0);

  const smoothCursorX = useSpring(cursorX, { stiffness: 120, damping: 25, mass: 0.22 });
  const smoothCursorY = useSpring(cursorY, { stiffness: 120, damping: 25, mass: 0.22 });
  const smoothDriftX = useSpring(driftX, { stiffness: 80, damping: 22, mass: 0.28 });
  const smoothDriftY = useSpring(driftY, { stiffness: 80, damping: 22, mass: 0.28 });

  const reverseDriftX = useTransform(smoothDriftX, (value) => -value * 0.72);
  const reverseDriftY = useTransform(smoothDriftY, (value) => -value * 0.62);

  useEffect(() => {
    const query = window.matchMedia('(pointer: fine)');

    const updatePointerMode = () => setFinePointer(query.matches);
    updatePointerMode();
    query.addEventListener('change', updatePointerMode);

    if (reduceMotion || !query.matches) {
      return () => query.removeEventListener('change', updatePointerMode);
    }

    const onPointerMove = (event: PointerEvent) => {
      cursorX.set(event.clientX);
      cursorY.set(event.clientY);

      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      driftX.set(nx * 28);
      driftY.set(ny * 20);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      query.removeEventListener('change', updatePointerMode);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [cursorX, cursorY, driftX, driftY, reduceMotion]);

  return (
    <div className="interactive-background" aria-hidden="true">
      {finePointer && !reduceMotion && (
        <>
          <motion.div
            className="interactive-background__cursor"
            style={{ x: smoothCursorX, y: smoothCursorY }}
          />
          <motion.div
            className="interactive-background__orbit interactive-background__orbit--one"
            style={{ x: smoothDriftX, y: smoothDriftY }}
          />
          <motion.div
            className="interactive-background__orbit interactive-background__orbit--two"
            style={{ x: reverseDriftX, y: reverseDriftY }}
          />
        </>
      )}
    </div>
  );
}
