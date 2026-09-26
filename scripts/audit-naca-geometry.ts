import { buildSimulation } from '../src/simulation/buildSimulation';
import {
  NACA_OPTIONS,
  RESOLUTION_CELLS,
  type Resolution,
  type SimConfig,
} from '../src/types/SimConfig';

const RESOLUTIONS: Resolution[] = ['low', 'medium', 'high'];
const ANGLES = [-15, -10, -5, 0, 5, 10, 15];

interface Cell {
  x: number;
  y: number;
}

interface ComponentResult {
  labels: Int32Array;
  sizes: number[];
}

interface CaseResult {
  profile: string;
  resolution: Resolution;
  angle: number;
  targetWidth: number;
  charCells: number;
  metadataRe: number;
  placedChordRe: number;
  metadataDx: number;
  placedChordDx: number;
  width: number;
  height: number;
  solidCells: number;
  components4: number;
  components8: number;
  smallest4: number;
  smallest8: number;
  tipCells: Cell[];
  tipComponent4Size: number;
  tipComponent8Size: number;
}

function configFor(
  profile: string,
  resolution: Resolution,
  angle: number,
): SimConfig {
  return {
    domain: {
      mode: 'freeflow',
      tunnelMode: 'manual',
      widthM: 0.5,
      heightM: 0.2,
    },
    geometry: {
      type: 'naca',
      charLengthM: 0.2,
      resolution,
      nacaCode: profile,
      angleOfAttack: angle,
    },
    boundaries: {
      inletFace: 'left',
      outletFace: 'right',
      speedMs: 0.05,
      inletProfile: 'uniform',
    },
    fluid: {
      preset: 'air',
      nuPhysical: 1.5e-5,
      rhoPhysical: 1.225,
    },
    view: 'magnitude',
  };
}

function bodyCells(mask: Uint8Array, Nx: number, Ny: number): Cell[] {
  const cells: Cell[] = [];
  for (let x = 0; x < Nx; x++) {
    for (let y = 0; y < Ny; y++) {
      if (mask[x * Ny + y] === 2) cells.push({ x, y });
    }
  }
  return cells;
}

function components(
  mask: Uint8Array,
  Nx: number,
  Ny: number,
  diagonal: boolean,
): ComponentResult {
  const labels = new Int32Array(mask.length);
  labels.fill(-1);
  const directions: Cell[] = diagonal
    ? [
        { x: -1, y: -1 },
        { x: -1, y: 0 },
        { x: -1, y: 1 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]
    : [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ];
  const sizes: number[] = [];

  for (let x = 0; x < Nx; x++) {
    for (let y = 0; y < Ny; y++) {
      const start = x * Ny + y;
      if (mask[start] !== 2 || labels[start] !== -1) continue;

      const label = sizes.length;
      const queue: Cell[] = [{ x, y }];
      labels[start] = label;
      let size = 0;

      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        size++;
        for (const direction of directions) {
          const nextX = cell.x + direction.x;
          const nextY = cell.y + direction.y;
          if (nextX < 0 || nextX >= Nx || nextY < 0 || nextY >= Ny) continue;
          const index = nextX * Ny + nextY;
          if (mask[index] !== 2 || labels[index] !== -1) continue;
          labels[index] = label;
          queue.push({ x: nextX, y: nextY });
        }
      }
      sizes.push(size);
    }
  }

  return { labels, sizes };
}

function analyze(
  profile: string,
  resolution: Resolution,
  angle: number,
): { result: CaseResult; mask: Uint8Array; Nx: number; Ny: number; components4: ComponentResult } {
  const built = buildSimulation(configFor(profile, resolution, angle), null, null);
  const mask = built.solver.solid;
  const cells = bodyCells(mask, built.Nx, built.Ny);
  const components4 = components(mask, built.Nx, built.Ny, false);
  const components8 = components(mask, built.Nx, built.Ny, true);
  if (cells.length === 0) {
    return {
      result: {
        profile,
        resolution,
        angle,
        targetWidth: RESOLUTION_CELLS[resolution],
        charCells: built.charCells,
        metadataRe: built.lbm.Re,
        placedChordRe:
          built.lbm.Re * (RESOLUTION_CELLS[resolution] / built.charCells),
        metadataDx: built.lbm.dx,
        placedChordDx:
          built.config.geometry.charLengthM / RESOLUTION_CELLS[resolution],
        width: 0,
        height: 0,
        solidCells: 0,
        components4: 0,
        components8: 0,
        smallest4: 0,
        smallest8: 0,
        tipCells: [],
        tipComponent4Size: 0,
        tipComponent8Size: 0,
      },
      mask,
      Nx: built.Nx,
      Ny: built.Ny,
      components4,
    };
  }
  const minX = Math.min(...cells.map((cell) => cell.x));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const tipCells = cells.filter((cell) => cell.x === maxX);
  const tipIndex = tipCells[0].x * built.Ny + tipCells[0].y;
  const tipLabel4 = components4.labels[tipIndex];
  const tipLabel8 = components8.labels[tipIndex];

  return {
    result: {
      profile,
      resolution,
      angle,
      targetWidth: RESOLUTION_CELLS[resolution],
      charCells: built.charCells,
      metadataRe: built.lbm.Re,
      placedChordRe:
        built.lbm.Re * (RESOLUTION_CELLS[resolution] / built.charCells),
      metadataDx: built.lbm.dx,
      placedChordDx:
        built.config.geometry.charLengthM / RESOLUTION_CELLS[resolution],
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      solidCells: cells.length,
      components4: components4.sizes.length,
      components8: components8.sizes.length,
      smallest4: Math.min(...components4.sizes),
      smallest8: Math.min(...components8.sizes),
      tipCells,
      tipComponent4Size: components4.sizes[tipLabel4],
      tipComponent8Size: components8.sizes[tipLabel8],
    },
    mask,
    Nx: built.Nx,
    Ny: built.Ny,
    components4,
  };
}

function asciiCase(
  mask: Uint8Array,
  Nx: number,
  Ny: number,
  components4: ComponentResult,
): string {
  const cells = bodyCells(mask, Nx, Ny);
  const minX = Math.min(...cells.map((cell) => cell.x));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const largest4 = components4.sizes.indexOf(Math.max(...components4.sizes));
  const lines: string[] = [];

  for (let y = maxY + 1; y >= minY - 1; y--) {
    let line = '';
    for (let x = minX - 1; x <= maxX + 1; x++) {
      if (x < 0 || x >= Nx || y < 0 || y >= Ny) {
        line += ' ';
        continue;
      }
      const index = x * Ny + y;
      if (mask[index] !== 2) {
        line += ' ';
      } else {
        line += components4.labels[index] === largest4 ? '#' : 'o';
      }
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

const cases: CaseResult[] = [];
let exactCase: ReturnType<typeof analyze> | null = null;

for (const profile of NACA_OPTIONS) {
  for (const resolution of RESOLUTIONS) {
    for (const angle of ANGLES) {
      const analyzed = analyze(profile, resolution, angle);
      cases.push(analyzed.result);
      if (profile === '2412' && resolution === 'high' && angle === 10) {
        exactCase = analyzed;
      }
    }
  }
}

const summary = {
  caseCount: cases.length,
  referenceLengthMismatchCases: cases.filter(
    (entry) => entry.charCells !== entry.targetWidth,
  ).length,
  emptyMaskCases: cases
    .filter((entry) => entry.solidCells === 0)
    .map((entry) => `${entry.profile}/${entry.resolution}/${entry.angle}`),
  disconnected4Cases: cases.filter((entry) => entry.components4 > 1).length,
  disconnected8Cases: cases.filter((entry) => entry.components8 > 1).length,
  disconnected8ByProfile: Object.fromEntries(
    NACA_OPTIONS.map((profile) => [
      profile,
      cases.filter(
        (entry) => entry.profile === profile && entry.components8 > 1,
      ).length,
    ]),
  ),
  disconnected8ByResolution: Object.fromEntries(
    RESOLUTIONS.map((resolution) => [
      resolution,
      cases.filter(
        (entry) => entry.resolution === resolution && entry.components8 > 1,
      ).length,
    ]),
  ),
  zeroAngleWidthsByResolution: Object.fromEntries(
    RESOLUTIONS.map((resolution) => {
      const values = cases.filter(
        (entry) =>
          entry.resolution === resolution &&
          entry.angle === 0 &&
          entry.solidCells > 0,
      );
      return [
        resolution,
        {
          targetWidth: RESOLUTION_CELLS[resolution],
          metadataCharCells: [...new Set(values.map((entry) => entry.charCells))],
          measuredWidthRange: [
            Math.min(...values.map((entry) => entry.width)),
            Math.max(...values.map((entry) => entry.width)),
          ],
        },
      ];
    }),
  ),
  disconnected8CasesList: cases
    .filter((entry) => entry.components8 > 1)
    .map(
      (entry) =>
        `${entry.profile}/${entry.resolution}/${entry.angle}: ` +
        `${entry.components8} components, smallest=${entry.smallest8}, ` +
        `tip-component=${entry.tipComponent8Size}`,
    ),
};

if (process.argv.includes('--csv')) {
  const headers = Object.keys(cases[0]) as (keyof CaseResult)[];
  console.log(headers.join(','));
  for (const entry of cases) {
    console.log(
      headers
        .map((header) => {
          const value = entry[header];
          return Array.isArray(value) ? JSON.stringify(value) : String(value);
        })
        .join(','),
    );
  }
  process.exit(0);
}

console.log(JSON.stringify(summary, null, 2));
if (!exactCase) throw new Error('Exact QA case was not evaluated.');
console.log('\nEXACT QA CASE');
console.log(JSON.stringify(exactCase.result, null, 2));
console.log('\n4-CONNECTED MASK (# largest component, o other components)');
console.log(
  asciiCase(
    exactCase.mask,
    exactCase.Nx,
    exactCase.Ny,
    exactCase.components4,
  ),
);
