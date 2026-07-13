import { useState } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { DomainSection } from './sections/DomainSection';
import { GeometrySection } from './sections/GeometrySection';
import { BoundarySection } from './sections/BoundarySection';
import { FluidSection } from './sections/FluidSection';
import { SafetyIndicator } from './SafetyIndicator';
import type { SimConfig, ViewField } from '../types/SimConfig';
import type { LBMParams } from '../physics/physicsToLBM';

interface Props {
  config: SimConfig;
  onChange: (next: SimConfig) => void;
  Nx: number;
  Ny: number;
  onSvgMask: (mask: Uint8Array | null) => void;
  onTunnelMask: (mask: Uint8Array | null) => void;
  hasTunnelMask: boolean;
  configLocked: boolean;
  lbm: LBMParams;
  charCells: number;
  view: ViewField;
  onViewChange: (v: ViewField) => void;
}

const VIEW_OPTIONS: { value: ViewField; label: string }[] = [
  { value: 'magnitude', label: '|U|' },
  { value: 'ux', label: 'Ux' },
  { value: 'uy', label: 'Uy' },
  { value: 'vorticity', label: 'ωz' },
];

export function SettingsPanelOverlay({
  config,
  onChange,
  Nx,
  Ny,
  onSvgMask,
  onTunnelMask,
  hasTunnelMask,
  configLocked,
  lbm,
  charCells,
  view,
  onViewChange,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-overlay">
      <button
        className={`settings-btn${open ? ' settings-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Close settings' : 'Open settings'}
        aria-label="Settings"
      >
        ⚙
      </button>

      <FloatingPanel open={open} onClose={() => setOpen(false)} className="settings-panel">
        <div className="settings-panel-inner">

          <DomainSection
            value={config.domain}
            geometry={config.geometry}
            onChange={(domain) => onChange({ ...config, domain })}
            Nx={Nx}
            Ny={Ny}
            onTunnelMask={onTunnelMask}
            hasTunnelMask={hasTunnelMask}
            disabled={configLocked}
          />

          <GeometrySection
            value={config.geometry}
            onChange={(geometry) => onChange({ ...config, geometry })}
            Nx={Nx}
            Ny={Ny}
            onSvgMask={onSvgMask}
            disabled={configLocked}
          />

          <BoundarySection
            value={config.boundaries}
            onChange={(boundaries) => onChange({ ...config, boundaries })}
            disabled={configLocked}
          />

          <FluidSection
            value={config.fluid}
            lbm={lbm}
            warnings={[]}
            onChange={(fluid) => onChange({ ...config, fluid })}
            disabled={configLocked}
          />

          {/* VISUALIZATION section */}
          <section>
            <p className="section-label">VISUALIZATION</p>

            <p className="subsection-label">FIELD</p>
            <div className="radio-row" style={{ flexWrap: 'nowrap', gap: 4 }}>
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`pill view-pill${view === opt.value ? ' active' : ''}`}
                  onClick={() => onViewChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

          </section>

          <SafetyIndicator lbm={lbm} charCells={charCells} />
        </div>
      </FloatingPanel>
    </div>
  );
}
