import type { StrouhalEstimate } from '../physics/spectral';
import type { GeometryType } from '../types/SimConfig';

export interface ForceObservation {
  Cd: number;
}

export type ConvergenceStatus =
  | 'insufficient'
  | 'converging'
  | 'oscillating'
  | 'unstable';

export type NumericalSafety = 'ok' | 'warn' | 'error';

export interface InterpretationInput {
  geometryType: GeometryType | null;
  re: number;
  numericalSafety: NumericalSafety;
  convergence: ConvergenceStatus;
  strouhal: StrouhalEstimate;
  blockageRatio: number | null;
}

export type InterpretationConfidence =
  | 'not-applicable'
  | 'collecting'
  | 'supported'
  | 'caution'
  | 'unreliable';

export interface FlowInterpretation {
  confidence: InterpretationConfidence;
  title: string;
  summary: string;
  evidence: string[];
  caveats: string[];
}

export function forceConvergenceStatus(
  history: readonly ForceObservation[],
): ConvergenceStatus {
  if (history.length < 50) return 'insufficient';

  const recent = history.slice(-100);
  const cdValues = recent.map((sample) => sample.Cd);
  const cdMean = cdValues.reduce((sum, value) => sum + value, 0) / cdValues.length;
  const absMean = Math.abs(cdMean);

  if (!Number.isFinite(cdMean) || absMean > 50 || absMean < 1e-6) {
    return 'unstable';
  }

  const cdStd = Math.sqrt(
    cdValues.reduce((sum, value) => sum + (value - cdMean) ** 2, 0) /
      cdValues.length,
  );
  const coefficientOfVariation = cdStd / absMean;

  let crossings = 0;
  for (let index = 1; index < cdValues.length; index++) {
    if (
      (cdValues[index - 1] - cdMean) * (cdValues[index] - cdMean) <
      0
    ) {
      crossings++;
    }
  }

  if (coefficientOfVariation < 0.03) return 'converging';
  if (crossings >= 4 && coefficientOfVariation < 0.5) return 'oscillating';
  if (coefficientOfVariation < 0.15) return 'oscillating';
  return 'unstable';
}

function finalize(
  input: InterpretationInput,
  interpretation: FlowInterpretation,
): FlowInterpretation {
  const caveats = [...interpretation.caveats];

  if (input.numericalSafety === 'warn') {
    caveats.unshift(
      'The numerical safety indicator is borderline; treat this interpretation with caution.',
    );
  }

  if (input.blockageRatio !== null && input.blockageRatio > 0.05) {
    caveats.push(
      'Side-wall confinement can shift measured forces and frequencies relative to unconfined references.',
    );
  }

  if (input.geometryType === 'cylinder' && input.re >= 190) {
    caveats.push(
      "At this Reynolds number, real cylinder wakes are three-dimensional; SOPLO's two-dimensional result is qualitative.",
    );
  }

  return {
    ...interpretation,
    confidence:
      input.numericalSafety === 'warn'
        ? 'caution'
        : interpretation.confidence,
    caveats,
  };
}

function result(
  confidence: InterpretationConfidence,
  title: string,
  summary: string,
  evidence: string[] = [],
): FlowInterpretation {
  return { confidence, title, summary, evidence, caveats: [] };
}

function periodicEvidence(strouhal: StrouhalEstimate): string[] {
  if (strouhal.st === null) return [];
  return [
    `The resolved Strouhal number is ${strouhal.st.toFixed(4)}, based on ${strouhal.periods.toFixed(1)} periods in the lift record.`,
  ];
}

export function interpretFlow(
  input: InterpretationInput,
): FlowInterpretation {
  if (input.numericalSafety === 'error') {
    return result(
      'unreliable',
      'Interpretation not reliable',
      "This setup is outside SOPLO's reliable numerical range. Adjust the configuration before drawing conclusions from the flow pattern.",
    );
  }

  if (input.geometryType === null) {
    return finalize(
      input,
      result(
        'collecting',
        'No built run yet',
        'Build and start a simulation before interpreting its flow evidence.',
      ),
    );
  }

  if (input.geometryType === 'none') {
    return finalize(
      input,
      result(
        'not-applicable',
        'No body wake to interpret',
        'This run has no aerodynamic body, so there are no body-force or wake results to explain.',
      ),
    );
  }

  if (input.convergence === 'insufficient') {
    return finalize(
      input,
      result(
        'collecting',
        'Collecting force history',
        'The force record is still too short to distinguish a settling signal from a recurring variation. Let the simulation continue.',
      ),
    );
  }

  if (input.convergence === 'unstable') {
    return finalize(
      input,
      result(
        'caution',
        'Force signal not settled',
        'The recent aerodynamic-force signal is not settled enough for a physical interpretation.',
      ),
    );
  }

  if (input.convergence === 'converging' && input.strouhal.status === 'ok') {
    return finalize(
      input,
      result(
        'caution',
        'Indicators disagree',
        'The drag signal is settling, but the lift spectrum reports a dominant periodic frequency. Run longer before assigning a flow regime.',
        periodicEvidence(input.strouhal),
      ),
    );
  }

  if (
    input.geometryType === 'cylinder' &&
    input.re <= 47 &&
    input.strouhal.status === 'ok'
  ) {
    return finalize(
      input,
      result(
        'caution',
        'Low-Reynolds indicators disagree',
        'The spectrum reports a dominant periodic frequency below the documented cylinder shedding onset. Treat this as conflicting evidence, not a named wake regime.',
        periodicEvidence(input.strouhal),
      ),
    );
  }

  if (input.convergence === 'converging') {
    const cylinderSteady =
      input.geometryType === 'cylinder' && input.re <= 47;
    return finalize(
      input,
      result(
        'supported',
        cylinderSteady ? 'Steady cylinder wake' : 'Force signal settling',
        cylinderSteady
          ? 'The recent force signal is settling toward a steady value, consistent with the documented steady-cylinder regime at this Reynolds number.'
          : 'The recent aerodynamic-force signal is settling toward a steady value.',
        ['The recent drag-coefficient signal is nearly constant.'],
      ),
    );
  }

  if (input.strouhal.status === 'filling') {
    return finalize(
      input,
      result(
        'collecting',
        'Variation detected; period still collecting',
        'The force signal varies, but the record is not yet long enough to determine whether that variation has a stable period.',
      ),
    );
  }

  if (input.strouhal.status === 'no-peak') {
    return finalize(
      input,
      result(
        'caution',
        'No dominant period resolved',
        'The recent force signal varies, but this record contains no resolved dominant periodic lift frequency.',
      ),
    );
  }

  if (input.strouhal.status === 'band-edge') {
    return finalize(
      input,
      result(
        'collecting',
        'Slow variation not yet resolved',
        'A slow variation may be present at the edge of the analysed frequency range. Let the simulation run longer before interpreting it.',
      ),
    );
  }

  const cylinderVortexStreet =
    input.geometryType === 'cylinder' && input.re > 49 && input.re < 178;

  return finalize(
    input,
    result(
      'supported',
      cylinderVortexStreet
        ? 'Laminar von Kármán vortex street'
        : 'Dominant periodic lift signal',
      cylinderVortexStreet
        ? 'The lift signal has a stable period consistent with alternating vortices shed from the cylinder. The Strouhal number is the dimensionless frequency of that cycle.'
        : 'The lift signal contains a resolved dominant period. The available evidence supports a recurring aerodynamic load, but not a geometry-specific wake label.',
      periodicEvidence(input.strouhal),
    ),
  );
}
