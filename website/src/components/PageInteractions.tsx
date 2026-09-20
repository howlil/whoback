import { useEffect } from 'react';

function animateCount(element: HTMLElement) {
  const target = Number(element.dataset.count ?? '');
  if (!Number.isFinite(target)) return;

  const formatter = new Intl.NumberFormat('en-US');
  const duration = 650;
  const start = performance.now();

  const frame = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter.format(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

export function PageInteractions() {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hero = document.querySelector<HTMLElement>('.reference-hero');
    const revealTargets = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];

    const pointerQuery = window.matchMedia('(pointer: fine)');
    const onPointerMove = (event: PointerEvent) => {
      if (!hero || reduceMotion || !pointerQuery.matches) return;
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      hero.style.setProperty('--hero-shift-x', `${x * -10}px`);
      hero.style.setProperty('--hero-shift-y', `${y * -7}px`);
    };

    if (!reduceMotion) window.addEventListener('pointermove', onPointerMove, { passive: true });

    if (reduceMotion) {
      for (const element of revealTargets) element.classList.add('is-visible');
      return () => window.removeEventListener('pointermove', onPointerMove);
    }

    const counted = new WeakSet<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.classList.add('is-visible');

          for (const counter of element.querySelectorAll<HTMLElement>('[data-count]')) {
            if (counted.has(counter)) continue;
            counted.add(counter);
            animateCount(counter);
          }

          observer.unobserve(element);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );

    for (const target of revealTargets) observer.observe(target);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return null;
}
