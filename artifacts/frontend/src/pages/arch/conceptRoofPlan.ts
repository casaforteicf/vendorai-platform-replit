// Cobertura do 3D calculada por pavimento: cada trecho da planta recebe laje na altura do seu
// próprio pavimento quando não há outro pavimento em cima. Antes era uma única tampa do tamanho
// do retângulo envolvente de todos os pavimentos, flutuando sobre vazios e deixando partes
// térreas de sobrados sem cobertura.

export type RoofCell = { x: number; y: number; width: number; height: number };
export type RoofLevel = { floor: number; cells: RoofCell[] };
export type RoofSlab = RoofCell & { floor: number };
export type RoofEdge = { floor: number; x1: number; y1: number; x2: number; y2: number };

const EPS = 0.02;

function inside(cells: RoofCell[], x: number, y: number) {
  return cells.some((cell) => x > cell.x + EPS && x < cell.x + cell.width - EPS && y > cell.y + EPS && y < cell.y + cell.height - EPS);
}

export function buildRoofPlan(levels: RoofLevel[], step = 0.25) {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("ROOF_STEP_INVALID");
  let sampledCells = 0;
  const byFloor = new Map<number, RoofCell[]>();
  for (const level of levels) {
    if (!Number.isSafeInteger(level.floor)) throw new RangeError("ROOF_FLOOR_INVALID");
    for (const cell of level.cells ?? []) {
      if (![cell.x, cell.y, cell.width, cell.height, cell.x + cell.width, cell.y + cell.height].every(Number.isFinite)) {
        throw new RangeError("ROOF_CELL_INVALID");
      }
      if (cell.width <= 0.05 || cell.height <= 0.05) continue;
      const columns = Math.max(1, Math.round(cell.width / step));
      const rows = Math.max(1, Math.round(cell.height / step));
      sampledCells += columns * rows;
      if (!Number.isSafeInteger(sampledCells) || sampledCells > 250000) throw new RangeError("ROOF_GRID_LIMIT");
    }
    const valid = (level.cells ?? []).filter((cell) => cell.width > 0.05 && cell.height > 0.05);
    byFloor.set(level.floor, [...(byFloor.get(level.floor) ?? []), ...valid]);
  }
  // Vazios internos (escada, shafts, cômodos que a detecção não fechou) ficam cercados por
  // construção: entram na cobertura para não abrir um buraco na laje do 3D.
  for (const [floor, cells] of byFloor) byFloor.set(floor, [...cells, ...enclosedVoids(cells, step)]);
  const floors = [...byFloor.keys()].sort((a, b) => a - b);
  const slabs: RoofSlab[] = [];
  const edges: RoofEdge[] = [];

  for (const floor of floors) {
    const cells = byFloor.get(floor) ?? [];
    const above = byFloor.get(floor + 1) ?? [];
    for (const cell of cells) {
      // Parte do cômodo coberta pelo pavimento de cima não recebe laje aparente.
      const columns = Math.max(1, Math.round(cell.width / step));
      const rows = Math.max(1, Math.round(cell.height / step));
      const cw = cell.width / columns;
      const rh = cell.height / rows;
      for (let row = 0; row < rows; row += 1) {
        let runStart = -1;
        for (let column = 0; column <= columns; column += 1) {
          const exposed = column < columns
            && !inside(above, cell.x + cw * (column + 0.5), cell.y + rh * (row + 0.5));
          if (exposed && runStart < 0) runStart = column;
          if (!exposed && runStart >= 0) {
            slabs.push({ floor, x: cell.x + cw * runStart, y: cell.y + rh * row, width: cw * (column - runStart), height: rh });
            runStart = -1;
          }
        }
      }
    }

    // Platibanda: borda externa do pavimento onde não sobe parede do pavimento de cima.
    for (const cell of cells) {
      const sides: Array<[number, number, number, number, number, number]> = [
        [cell.x, cell.y, cell.x + cell.width, cell.y, 0, -1],
        [cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height, 0, 1],
        [cell.x, cell.y, cell.x, cell.y + cell.height, -1, 0],
        [cell.x + cell.width, cell.y, cell.x + cell.width, cell.y + cell.height, 1, 0],
      ];
      for (const [x1, y1, x2, y2, nx, ny] of sides) {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const parts = Math.max(1, Math.round(length / step));
        let runStart = -1;
        for (let index = 0; index <= parts; index += 1) {
          let exterior = false;
          if (index < parts) {
            const t = (index + 0.5) / parts;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            const outX = px + nx * 0.1;
            const outY = py + ny * 0.1;
            const inX = px - nx * 0.1;
            const inY = py - ny * 0.1;
            exterior = !inside(cells, outX, outY) && !inside(above, inX, inY);
          }
          if (exterior && runStart < 0) runStart = index;
          if (!exterior && runStart >= 0) {
            const a = runStart / parts;
            const b = index / parts;
            edges.push({ floor, x1: x1 + (x2 - x1) * a, y1: y1 + (y2 - y1) * a, x2: x1 + (x2 - x1) * b, y2: y1 + (y2 - y1) * b });
            runStart = -1;
          }
        }
      }
    }
  }
  return { slabs: mergeSlabs(slabs), edges };
}

/** Junta faixas empilhadas de mesma largura para gerar poucas peças no 3D. */
function mergeSlabs(slabs: RoofSlab[]) {
  const sorted = [...slabs].sort((a, b) => a.floor - b.floor || a.x - b.x || a.width - b.width || a.y - b.y);
  const merged: RoofSlab[] = [];
  for (const slab of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.floor === slab.floor && Math.abs(last.x - slab.x) < EPS && Math.abs(last.width - slab.width) < EPS
      && Math.abs(last.y + last.height - slab.y) < EPS) {
      last.height += slab.height;
    } else {
      merged.push({ ...slab });
    }
  }
  return merged;
}


function enclosedVoids(cells: RoofCell[], step: number): RoofCell[] {
  if (!cells.length) return [];
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxX = Math.max(...cells.map((cell) => cell.x + cell.width));
  const maxY = Math.max(...cells.map((cell) => cell.y + cell.height));
  const columns = Math.round((maxX - minX) / step);
  const rows = Math.round((maxY - minY) / step);
  if (columns <= 0 || rows <= 0 || columns * rows > 40000) return [];
  const filled: boolean[][] = [];
  for (let row = 0; row < rows; row += 1) {
    filled.push([]);
    for (let column = 0; column < columns; column += 1) {
      filled[row].push(inside(cells, minX + step * (column + 0.5), minY + step * (row + 0.5)));
    }
  }
  // Tudo o que é vazio e alcança a borda do retângulo é exterior; o resto é vazio interno.
  const outside = filled.map((line) => line.map(() => false));
  const queue: Array<[number, number]> = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    if ((row === 0 || column === 0 || row === rows - 1 || column === columns - 1) && !filled[row][column]) {
      outside[row][column] = true;
      queue.push([row, column]);
    }
  }
  while (queue.length) {
    const [row, column] = queue.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = row + dr;
      const c = column + dc;
      if (r < 0 || c < 0 || r >= rows || c >= columns || filled[r][c] || outside[r][c]) continue;
      outside[r][c] = true;
      queue.push([r, c]);
    }
  }
  const voids: RoofCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    let start = -1;
    for (let column = 0; column <= columns; column += 1) {
      const hole = column < columns && !filled[row][column] && !outside[row][column];
      if (hole && start < 0) start = column;
      if (!hole && start >= 0) {
        voids.push({ x: minX + step * start, y: minY + step * row, width: step * (column - start), height: step });
        start = -1;
      }
    }
  }
  return voids;
}
