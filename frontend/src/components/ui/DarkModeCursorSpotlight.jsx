import React, { useEffect, useState } from 'react';

/**
 * DarkModeCursorSpotlight - Ethereal ambient light following cursor in dark mode
 *
 * Renders a pointer-events-none radial light bloom around the mouse cursor
 * only when dark mode is enabled, elevating the dark aesthetic seamlessly.
 */
export default function DarkModeCursorSpotlight() {
  const [coords, setCoords] = useState({ x: -1000, y: -1000 });
  const [isVisible, setIsVisible] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isDark) return undefined;

    const handlePointerMove = (e) => {
      setCoords({ x: e.clientX, y: e.clientY });
      if (!isVisible) setIsVisible(true);
    };

    const handlePointerLeave = () => {
      setIsVisible(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [isDark, isVisible]);

  if (!isDark) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
      style={{
        opacity: isVisible ? 1 : 0,
        background: `radial-gradient(550px circle at ${coords.x}px ${coords.y}px, rgba(59, 130, 246, 0.12), rgba(129, 140, 248, 0.05) 35%, transparent 70%)`,
      }}
    />
  );
}
