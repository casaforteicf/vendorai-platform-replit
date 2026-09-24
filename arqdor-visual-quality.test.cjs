// Run with node --test arqdor-visual-quality.test.cjs (uses workspace TypeScript).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  module._compile(result.outputText, filename);
};
const base = path.join(__dirname, 'artifacts/frontend/src/pages/arch');
const { buildDerivedFacadeModel } = require(path.join(base, 'conceptFacadeGeometry.ts'));
const { inspectConceptVisualQuality } = require(path.join(base, 'conceptVisualQuality.ts'));
const { conceptReferenceSize } = require(path.join(base, 'conceptReferenceImage.ts'));
const { buildFacadeMeshBoxes } = require(path.join(base, 'conceptFacadeMeshes.ts'));
const { DEFAULT_FACADE_DESIGN } = require(path.join(base, 'conceptFacadeDesign.ts'));
const placement = { frontSide: 'top', setbackFront: 0, setbackRear: 0, setbackLeft: 0, setbackRight: 0 };
const room = (floor, x = 0, y = 0, width = 10) => ({ id: `room-${floor}`, kind: 'sala', label: 'Sala', floor, x, y, width, depth: 5 });
const opening = (id, x, y) => ({ id, type: 'window', x, y, width: 1.2, height: 1.2, sillHeight: 0.9, orientation: 'horizontal', roomId: 'room' });
const level = (floor, openings = []) => ({ floor, walls: [], customWalls: [], closedSpaces: [], openings, labels: {}, stairs: [] });

test('upper-storey setback keeps its real opening; lateral/internal openings are excluded', () => {
  const levels = [level(0, [opening('ground', 2, 0)]), level(1, [opening('upper', 4, 2), { ...opening('side', 2, 2), orientation: 'vertical' }, opening('interior', 4, 4)])];
  const model = buildDerivedFacadeModel(levels, [room(0), room(1, 2, 2, 6)], placement);
  assert.deepEqual(model.openings.map(o => o.id), ['ground', 'upper']);
  assert.deepEqual(model.stories[1], { floor: 1, minAxis: 2, maxAxis: 8 });
});

test('three storeys keep all three actual widths and opening dimensions', () => {
  const model = buildDerivedFacadeModel([level(0), level(1), level(2, [opening('top', 4, 3)])], [room(0), room(1, 1, 1, 8), room(2, 2, 3, 6)], placement);
  assert.equal(model.stories.length, 3);
  assert.equal(model.height, 8.879999999999999);
  assert.equal(model.openings[0].width, 1.2);
});

test('a recessed visible front wall is retained while an internal opening is hidden', () => {
  const floor = level(0, [opening('recess', 7, 2), opening('internal', 7, 4)]);
  floor.walls = [ { x1: 0, y1: 0, x2: 5, y2: 0 }, { x1: 5, y1: 2, x2: 10, y2: 2 }, { x1: 5, y1: 4, x2: 10, y2: 4 } ];
  const model = buildDerivedFacadeModel([floor], [room(0)], placement);
  assert.deepEqual(model.openings.map(o => o.id), ['recess']);
});

test('portrait, wide and square reference cameras are preserved without cropping', () => {
  assert.deepEqual(conceptReferenceSize(1000, 2000, 2560), { width: 1000, height: 2000 });
  assert.deepEqual(conceptReferenceSize(4000, 1000, 2560), { width: 2560, height: 640 });
  assert.deepEqual(conceptReferenceSize(120, 60, 1600, true), { width: 1600, height: 800 });
  assert.throws(() => conceptReferenceSize(0, 100, 1600));
});

test('facade volumes preserve metric size on all four street sides and portals remain open', () => {
  const design = { ...DEFAULT_FACADE_DESIGN, volumes: [{ id: 'portal', kind: 'portal', x: 20, y: 0, width: 30, height: 100, depth: 0.4, materialId: 'concrete-light' }] };
  const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 20 };
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const boxes = buildFacadeMeshBoxes(design, bounds, 2.96, side);
    assert.equal(boxes.length, 3);
    assert.ok(boxes.every(box => Object.values(box).filter(v => typeof v === 'number').every(Number.isFinite)));
    const lintel = boxes[0];
    assert.equal(side === 'top' || side === 'bottom' ? lintel.width : lintel.depth, side === 'top' || side === 'bottom' ? 3 : 6);
    if (side === 'top') assert.equal(lintel.z, -0.2);
    if (side === 'bottom') assert.equal(lintel.z, 20.2);
    if (side === 'left') assert.equal(lintel.x, -0.2);
    if (side === 'right') assert.equal(lintel.x, 10.2);
  }
});

const input = () => ({ rooms: [room(0)], levels: [level(0, [opening('front', 5, 0)])], lotWidth: 15, lotDepth: 20, wallFirstFloors: [], objects: [], design: { ...DEFAULT_FACADE_DESIGN, volumes: [] }, placement });

test('valid project has no blocking errors; invalid upper-floor layout is detected', () => {
  const valid = input();
  assert.equal(inspectConceptVisualQuality(valid).filter(i => i.severity === 'error').length, 0);
  valid.levels.push(level(1));
  valid.rooms.push(room(1), { ...room(1), id: 'overlap', x: 1 });
  assert.ok(inspectConceptVisualQuality(valid).some(i => i.severity === 'error' && i.message.includes('Pavimento 2')));
});

test('invalid opening and a solid volume across a window are blocked without deleting them', () => {
  const project = input();
  project.design.volumes.push({ id: 'v', kind: 'planter', label: 'Jardineira', x: 40, y: 30, width: 20, height: 40, depth: 0.5, materialId: 'concrete-light' });
  const before = JSON.stringify(project);
  assert.ok(inspectConceptVisualQuality(project).some(i => i.id === 'volume-opening-v'));
  assert.equal(JSON.stringify(project), before);
  project.levels[0].openings[0].height = 3;
  assert.ok(inspectConceptVisualQuality(project).some(i => i.id.startsWith('opening-')));
});

test('facade component renders all storeys without inventing windows or entrances', () => {
  const frontendRequire = require('node:module').createRequire(path.join(base, '../../../package.json'));
  const React = frontendRequire('react');
  const { renderToStaticMarkup } = frontendRequire('react-dom/server');
  const Facade = require(path.join(base, 'ConceptDerivedFacade.tsx')).default;
  const svg = renderToStaticMarkup(React.createElement(Facade, {
    lotWidth: 15, levels: [level(0), level(1), level(2)], rooms: [room(0), room(1), room(2)], sitePlacement: placement,
    facade: { style: 'minimalista', primaryMaterial: 'pintura', accentMaterial: 'nenhum', frameTone: 'preto', facadeTone: 'claro', roof: 'platibanda', landscaping: 'leve' },
  }));
  assert.ok(!/NaN|undefined/.test(svg));
  const storeys = [...svg.matchAll(/<rect[^>]*width="([^"]+)"[^>]*height="([^"]+)"/g)].filter((match) => Math.abs(Number(match[1]) - 106) < 1e-6 && Math.abs(Number(match[2]) - 31.376) < 1e-6);
  assert.equal(storeys.length, 3);
  assert.equal((svg.match(/fill="url\(#technical-glass\)"/g) || []).length, 0);
});
