export type ConceptViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ConceptScreenPoint = {
  x: number;
  y: number;
};

export type ConceptViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function distanceBetweenPoints(a: ConceptScreenPoint, b: ConceptScreenPoint) {
  return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
}

export function midpointBetweenPoints(a: ConceptScreenPoint, b: ConceptScreenPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function worldPointFromScreen(
  screen: ConceptScreenPoint,
  viewport: ConceptViewportRect,
  view: ConceptViewBox,
) {
  return {
    x: view.x + ((screen.x - viewport.left) / Math.max(1, viewport.width)) * view.width,
    y: view.y + ((screen.y - viewport.top) / Math.max(1, viewport.height)) * view.height,
  };
}

export function pinchViewBox(input: {
  startView: ConceptViewBox;
  fitView: ConceptViewBox;
  startDistance: number;
  currentDistance: number;
  worldFocus: ConceptScreenPoint;
  currentMidpoint: ConceptScreenPoint;
  viewport: ConceptViewportRect;
}) {
  const minWidth = Math.max(3, input.fitView.width * 0.18);
  const maxWidth = input.fitView.width * 2.4;
  const scale = Math.max(0.05, input.startDistance) / Math.max(1, input.currentDistance);
  const nextWidth = Math.max(minWidth, Math.min(maxWidth, input.startView.width * scale));
  const ratio = nextWidth / Math.max(0.001, input.startView.width);
  const nextHeight = input.startView.height * ratio;
  const screenX = (input.currentMidpoint.x - input.viewport.left) / Math.max(1, input.viewport.width);
  const screenY = (input.currentMidpoint.y - input.viewport.top) / Math.max(1, input.viewport.height);

  return {
    x: input.worldFocus.x - screenX * nextWidth,
    y: input.worldFocus.y - screenY * nextHeight,
    width: nextWidth,
    height: nextHeight,
  };
}

export function pinchZoomScalar(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  minZoom: number,
  maxZoom: number,
) {
  const scale = Math.max(1, currentDistance) / Math.max(1, startDistance);
  return Math.max(minZoom, Math.min(maxZoom, Number((startZoom * scale).toFixed(3))));
}
