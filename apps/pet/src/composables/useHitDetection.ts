interface HitArea {
  x: number[];
  y: number[];
}

export function useHitDetection() {
  const getNormalizedCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  };

  const isInHitArea = (x: number, y: number, area: HitArea) => {
    return x >= area.x[0] && x <= area.x[1] &&
           y >= area.y[0] && y <= area.y[1];
  };

  return {
    getNormalizedCoords,
    isInHitArea
  };
}
