import { describe, expect, it } from 'vitest';
import {
  forceConvergenceStatus,
  interpretFlow,
  type InterpretationInput,
} from '../../src/interpretation/flowInterpretation';
import type { GeometryType } from '../../src/types/SimConfig';

const FILLING = {
  st: null,
  frequency: null,
  periods: 2,
  prominence: 0,
  status: 'filling' as const,
};

const PERIODIC = {
  st: 0.1691,
  frequency: 0.0003946,
  periods: 12.4,
  prominence: 281.7,
  status: 'ok' as const,
};

function input(
  overrides: Partial<InterpretationInput> = {},
): InterpretationInput {
  return {
    geometryType: 'cylinder',
    re: 100,
    numericalSafety: 'ok',
    convergence: 'oscillating',
    strouhal: PERIODIC,
    blockageRatio: 0.05,
    ...overrides,
  };
}

describe('forceConvergenceStatus', () => {
  it('preserves the 50-sample minimum', () => {
    const history = Array.from({ length: 49 }, () => ({ Cd: 1.4 }));
    expect(forceConvergenceStatus(history)).toBe('insufficient');
  });

  it('classifies a nearly constant drag signal as converging', () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      Cd: 1.4 + 0.01 * Math.sin(index),
    }));
    expect(forceConvergenceStatus(history)).toBe('converging');
  });

  it('classifies repeated moderate drag variation as oscillating', () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      Cd: 1.4 + 0.1 * Math.sin((2 * Math.PI * index) / 20),
    }));
    expect(forceConvergenceStatus(history)).toBe('oscillating');
  });

  it('classifies non-finite and strongly dispersed signals as unstable', () => {
    const nonFinite = Array.from({ length: 50 }, () => ({ Cd: Number.NaN }));
    const dispersed = Array.from({ length: 100 }, (_, index) => ({
      Cd: index % 2 === 0 ? 0.1 : 4,
    }));

    expect(forceConvergenceStatus(nonFinite)).toBe('unstable');
    expect(forceConvergenceStatus(dispersed)).toBe('unstable');
  });
});

describe('interpretFlow safety and availability precedence', () => {
  it('suppresses a positive regime when numerical safety is an error', () => {
    const interpretation = interpretFlow(input({ numericalSafety: 'error' }));

    expect(interpretation.confidence).toBe('unreliable');
    expect(interpretation.summary).toContain('outside SOPLO');
    expect(JSON.stringify(interpretation)).not.toContain('von Kármán');
  });

  it('keeps the observation but downgrades confidence on a safety warning', () => {
    const interpretation = interpretFlow(input({ numericalSafety: 'warn' }));

    expect(interpretation.confidence).toBe('caution');
    expect(interpretation.title).toContain('von Kármán');
    expect(interpretation.caveats.join(' ')).toContain('borderline');
  });

  it('handles missing and body-free runs explicitly', () => {
    expect(
      interpretFlow(input({ geometryType: null })).confidence,
    ).toBe('collecting');
    expect(
      interpretFlow(input({ geometryType: 'none' })).confidence,
    ).toBe('not-applicable');
  });

  it('does not assign a physical regime to insufficient or unstable data', () => {
    const insufficient = interpretFlow(
      input({ convergence: 'insufficient', strouhal: FILLING }),
    );
    const unstable = interpretFlow(input({ convergence: 'unstable' }));

    expect(insufficient.confidence).toBe('collecting');
    expect(unstable.confidence).toBe('caution');
    expect(`${insufficient.summary} ${unstable.summary}`).not.toMatch(
      /von Kármán|turbulen|chaotic/i,
    );
  });
});

describe('interpretFlow periodic evidence', () => {
  it('names a von Kármán street only for the validated cylinder window', () => {
    const interpretation = interpretFlow(input());

    expect(interpretation.confidence).toBe('supported');
    expect(interpretation.title).toContain('von Kármán');
    expect(interpretation.summary).toContain('alternating vortices');
    expect(interpretation.evidence.join(' ')).toContain('0.1691');
  });

  it.each<GeometryType>(['square', 'naca', 'svg', 'dxf'])(
    'keeps periodic %s wording geometry-neutral',
    (geometryType) => {
      const interpretation = interpretFlow(input({ geometryType }));
      const copy = JSON.stringify(interpretation);

      expect(interpretation.title).toBe('Dominant periodic lift signal');
      expect(copy).not.toMatch(/cylinder|von Kármán|Williamson/i);
    },
  );

  it('describes unresolved spectral states without overclaiming', () => {
    const states = [
      FILLING,
      { ...FILLING, status: 'no-peak' as const },
      { ...FILLING, status: 'band-edge' as const },
    ];

    for (const strouhal of states) {
      const interpretation = interpretFlow(input({ strouhal }));
      expect(JSON.stringify(interpretation)).not.toMatch(
        /von Kármán|not shedding periodically|turbulen|chaotic/i,
      );
    }
  });

  it('reports conflicting convergence and spectral evidence', () => {
    const interpretation = interpretFlow(
      input({ convergence: 'converging' }),
    );

    expect(interpretation.confidence).toBe('caution');
    expect(interpretation.title).toBe('Indicators disagree');
  });
});

describe('interpretFlow cylinder context', () => {
  it('recognizes a settling low-Re cylinder signal as consistent with steady flow', () => {
    const interpretation = interpretFlow(
      input({
        re: 20,
        convergence: 'converging',
        strouhal: { ...FILLING, status: 'no-peak' },
      }),
    );

    expect(interpretation.confidence).toBe('supported');
    expect(interpretation.title).toBe('Steady cylinder wake');
  });

  it('treats a low-Re periodic result as conflicting evidence', () => {
    const interpretation = interpretFlow(input({ re: 20 }));

    expect(interpretation.confidence).toBe('caution');
    expect(interpretation.title).toContain('disagree');
    expect(JSON.stringify(interpretation)).not.toContain('von Kármán');
  });

  it.each([48, 49, 178, 189])(
    'uses measured, unnamed periodic wording at Re %s',
    (re) => {
      const interpretation = interpretFlow(input({ re }));
      expect(interpretation.title).toBe('Dominant periodic lift signal');
      expect(JSON.stringify(interpretation)).not.toContain('von Kármán');
    },
  );

  it('adds the two-dimensional cylinder caveat from Re 190', () => {
    const below = interpretFlow(input({ re: 189 }));
    const atLimit = interpretFlow(input({ re: 190 }));

    expect(below.caveats.join(' ')).not.toContain('three-dimensional');
    expect(atLimit.caveats.join(' ')).toContain('three-dimensional');
  });
});

describe('interpretFlow confinement context', () => {
  it('adds a generic caveat only above five-percent blockage', () => {
    const unknown = interpretFlow(input({ blockageRatio: null }));
    const threshold = interpretFlow(input({ blockageRatio: 0.05 }));
    const confined = interpretFlow(input({ blockageRatio: 0.1 }));

    expect(unknown.caveats).toHaveLength(0);
    expect(threshold.caveats).toHaveLength(0);
    expect(confined.caveats.join(' ')).toContain('Side-wall confinement');
  });
});
