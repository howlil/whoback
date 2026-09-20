import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

export function InteractiveBackground() {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.28);

  const x = useSpring(pointerX, { stiffness: 90, damping: 24, mass: 0.25 });
  const y = useSpring(pointerY, { stiffness: 90, damping: 24, mass: 0.25 });

  const ringX = useTransform(x, (value) => value * 100);
  const ringY = useTransform(y, (value) => value * 100);
  const cursorLeft = useTransform(ringX, (value) => `${value}%`);
  const cursorTop = useTransform(ringY, (value) => `${value}%`);
  const driftX = useTransform(x, [0, 1], [-14, 14]);
  const driftY = useTransform(y, [0, 1], [-10, 10]);
  const reverseDriftX = useTransform(driftX, (value) => -value * 0.7);
  const reverseDriftY = useTransform(driftY, (value) => -value * 0.6);

  useEffect(() => {
    if (reduceMotion) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointerX.set(event.clientX / window.innerWidth);
      pointerY.set(event.clientY / window.innerHeight);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [pointerX, pointerY, reduceMotion]);

  return (
    <div className="interactive-background" aria-hidden="true">
      <div className="interactive-background__grid" />

      {!reduceMotion && (
        <>
          <motion.div
            className="interactive-background__cursor"
            style={{ left: cursorLeft, top: cursorTop }}
          />
          <motion.div
            className="interactive-background__orbit interactive-background__orbit--one"
            style={{ x: driftX, y: driftY }}
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
