import { describe, expect, it } from "vitest";
import {
  distanceBetweenPoints,
  midpointBetweenPoints,
  pinchViewBox,
  pinchZoomScalar,
  worldPointFromScreen,
} from "./conceptViewport";

describe("concept viewport gestures", () => {
  const fitView = { x: -2, y: -2, width: 16, height: 34 };
  const viewport = { left: 0, top: 0, width: 400, height: 800 };

  it("calcula distância e ponto médio de dois toques", () => {
    const a = { x: 100, y: 200 };
    const b = { x: 300, y: 400 };
    expect(distanceBetweenPoints(a, b)).toBeCloseTo(Math.hypot(200, 200));
    expect(midpointBetweenPoints(a, b)).toEqual({ x: 200, y: 300 });
  });

  it("converte o centro da tela para o centro do viewBox", () => {
    expect(worldPointFromScreen({ x: 200, y: 400 }, viewport, fitView)).toEqual({
      x: 6,
      y: 15,
    });
  });

  it("pinça abrindo aproxima a planta e preserva o foco", () => {
    const startView = { ...fitView };
    const focus = worldPointFromScreen({ x: 200, y: 400 }, viewport, startView);
    const next = pinchViewBox({
      startView,
      fitView,
      startDistance: 100,
      currentDistance: 200,
      worldFocus: focus,
      currentMidpoint: { x: 200, y: 400 },
      viewport,
    });
    expect(next.width).toBeCloseTo(8);
    expect(next.height).toBeCloseTo(17);
    expect(next.x + next.width / 2).toBeCloseTo(focus.x);
    expect(next.y + next.height / 2).toBeCloseTo(focus.y);
  });

  it("move o viewBox quando o ponto médio da pinça se desloca", () => {
    const focus = worldPointFromScreen({ x: 200, y: 400 }, viewport, fitView);
    const next = pinchViewBox({
      startView: fitView,
      fitView,
      startDistance: 100,
      currentDistance: 100,
      worldFocus: focus,
      currentMidpoint: { x: 240, y: 440 },
      viewport,
    });
    expect(next.x).toBeLessThan(fitView.x);
    expect(next.y).toBeLessThan(fitView.y);
  });

  it("respeita limites de zoom do 2D e do 3D", () => {
    const focus = worldPointFromScreen({ x: 200, y: 400 }, viewport, fitView);
    const next = pinchViewBox({
      startView: fitView,
      fitView,
      startDistance: 100,
      currentDistance: 10000,
      worldFocus: focus,
      currentMidpoint: { x: 200, y: 400 },
      viewport,
    });
    expect(next.width).toBeGreaterThanOrEqual(3);
    expect(pinchZoomScalar(1, 100, 10000, 0.55, 1.75)).toBe(1.75);
    expect(pinchZoomScalar(1, 100, 1, 0.55, 1.75)).toBe(0.55);
  });
});
