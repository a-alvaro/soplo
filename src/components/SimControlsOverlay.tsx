import type { Severity } from './SafetyIndicator';

interface Props {
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  running: boolean;
  hasSolver: boolean;
  disabled: boolean;
  disabledReason?: string;
  severity?: Severity;
  stepCount: number;
  fps: number;
  umaxPhys: number;
  showResults: boolean;
  onResultsToggle: () => void;
}

export function SimControlsOverlay({
  onRun,
  onPause,
  onReset,
  running,
  hasSolver,
  disabled,
  disabledReason,
  severity = 'ok',
  stepCount,
  fps,
  umaxPhys,
  showResults,
  onResultsToggle,
}: Props) {
  const isWarning = (severity === 'error' || severity === 'warn') && !disabled;
  const runLabel = severity === 'error' && !disabled ? '⚠ RUN ANYWAY' : '▶ RUN';
  const runTitle = disabled
    ? disabledReason
    : disabledReason
      ? `${disabledReason} Run again to retry.`
    : severity === 'error'
      ? 'Stability warning — may diverge'
      : severity === 'warn'
        ? 'Borderline stability'
        : 'Build solver and start';

  return (
    <div className="sim-controls-overlay">
      {/* Results toggle — only when solver is active */}
      {hasSolver && (
        <button
          className={`results-btn${showResults ? ' results-btn--active' : ''}`}
          onClick={onResultsToggle}
          title="Aerodynamic coefficients &amp; convergence"
        >
          ◈ RESULTS
        </button>
      )}

      <div className="sim-controls-btns">
        <button
          className={`sim-btn sim-btn-run${isWarning ? ' sim-btn-warn' : ''}`}
          onClick={onRun}
          disabled={disabled || running}
          title={runTitle}
        >
          {runLabel}
        </button>
        <button
          className="sim-btn"
          onClick={onPause}
          disabled={!hasSolver || !running}
          title="Pause simulation"
        >
          ‖ PAUSE
        </button>
        <button
          className="sim-btn"
          onClick={onReset}
          disabled={!hasSolver}
          title="Reset simulation"
        >
          ↺ RESET
        </button>
      </div>

      {disabledReason && (
        <p className="sim-controls-error">{disabledReason}</p>
      )}

      <div className="sim-controls-telemetry">
        <span className="sim-tele-label">STEP</span>
        <span className="sim-tele-value">{stepCount.toLocaleString()}</span>
        <span className="sim-tele-label">FPS</span>
        <span className="sim-tele-value">{fps.toFixed(1)}</span>
        <span className="sim-tele-label">|U|</span>
        <span className="sim-tele-value">{umaxPhys.toFixed(2)} m/s</span>
      </div>
    </div>
  );
}
