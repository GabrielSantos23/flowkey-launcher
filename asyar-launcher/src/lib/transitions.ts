// Pure cubicOut easing
export const cubicOut = (t: number) => --t * t * t + 1;
export const quartOut = (t: number) => 1 - --t * t * t * t;

/**
 * Subtle fly-in from below for view/tab content entering.
 */
export function viewEnter(node: Element, params: { duration?: number; y?: number } = {}) {
  const { duration = 150, y = 8 } = params;
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => `
      opacity: ${t};
      transform: translateY(${(1 - t) * y}px);
    `,
  };
}

/**
 * Quick fade-out for view/tab content exiting.
 */
export function viewExit(node: Element, params: { duration?: number } = {}) {
  const { duration = 100 } = params;
  return {
    duration,
    css: (t: number) => `opacity: ${t};`,
  };
}

/**
 * Scale + fade for popups, dialogs, and overlays.
 */
export function popupScale(node: Element, params: { duration?: number; start?: number } = {}) {
  const { duration = 120, start = 0.96 } = params;
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => {
      const scale = start + (1 - start) * t;
      return `
        opacity: ${t};
        transform: scale(${scale});
      `;
    },
  };
}

/**
 * Simple fade transition for backdrops and subtle elements.
 */
export function fadeIn(node: Element, params: { duration?: number } = {}) {
  const { duration = 150 } = params;
  return {
    duration,
    css: (t: number) => `opacity: ${t};`,
  };
}
