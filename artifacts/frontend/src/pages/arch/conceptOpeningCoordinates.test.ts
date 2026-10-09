import { expect, it } from "vitest";
import { openingCoordinates } from "./conceptOpeningCoordinates";

it("preserva posição abaixo de 8% e acima de 92%", () => {
  const wall = { x1: 0, y1: 2, x2: 20, y2: 2 };
  expect(openingCoordinates(wall, 0.03)).toEqual({ x: 0.6, y: 2 });
  expect(openingCoordinates(wall, 0.97)).toEqual({ x: 19.4, y: 2 });
});
it("usa o extremo inicial em parede desenhada no sentido inverso", () => {
  expect(openingCoordinates({ x1: 10, y1: 4, x2: 2, y2: 4 }, 0.25)).toEqual({ x: 8, y: 4 });
});
it("mantém coordenadas exatas em paredes verticais e diagonais", () => {
  expect(openingCoordinates({ x1: 2, y1: 1, x2: 2, y2: 11 }, 0.25)).toEqual({ x: 2, y: 3.5 });
  expect(openingCoordinates({ x1: 1, y1: 2, x2: 7, y2: 10 }, 0.25)).toEqual({ x: 2.5, y: 4 });
});
