# WebGPU backend roadmap

> Status: architectural direction, not implementation authorization.
> Recorded: 2026-09-22.
> The validated CPU `Float64` solver remains the reference implementation.

## 1. Decision

SOPLO will remain a zero-install browser application and may add WebGPU as an
optional accelerated backend in v2. WebGPU must not replace the CPU Web Worker
path: capability detection selects WebGPU when it is supported and validated;
all other users retain the current Worker backend.

Publishing SOPLO and adding WebGPU are independent. The current Vite build can
already be hosted as a static HTTPS site. WebGPU is intended to increase useful
grid resolution and throughput, not to make web distribution possible.

## 2. Why it fits SOPLO

D2Q9 LBM updates a regular grid with similar local work per cell, which maps
well to GPU compute. More affordable cells improve curved-body resolution,
permit larger domains and raise the numerical safe-Reynolds ceiling because
`Re_safe ≈ 21 · D_cells`.

The physical model does not change: WebGPU does not make SOPLO three-
dimensional, compressible or turbulence-resolving. Validity warnings and the
2D interpretation contract remain mandatory.

## 3. Non-negotiable architecture

1. `LBMSolver` on CPU/Worker remains the authoritative `Float64` reference.
2. A future `SimulationBackend` boundary exposes equivalent lifecycle,
   snapshot, force and spectral outputs for CPU and GPU implementations.
3. The WebGPU backend uses portable WGSL types. WGSL provides `f32` and
   optional `f16`, not portable `f64`; therefore GPU results require their own
   derived numerical tolerances and full revalidation.
4. Capability or device failure falls back explicitly to the CPU Worker. The
   active backend is visible to the user; failure is never hidden.
5. Population and field buffers remain GPU-resident during stepping. Readback
   is limited to bounded snapshots and diagnostics; copying full solver state
   every frame would erase much of the benefit.
6. No CPU and GPU solver-core edit may be combined in one validation claim.

## 4. Staged implementation

### Stage A — feasibility spike

- Detect adapter/device support in a secure context.
- Implement equilibrium, MRT collision and streaming for one fixed grid.
- Measure dispatch time, readback cost, memory and device-loss behaviour on at
  least integrated and discrete GPU classes when available.
- Register performance and parity predictions before running the campaign.

### Stage B — physical contracts

- Add solids, bounce-back, Zou–He boundaries and side-wall modes.
- Preserve force timing: post-collision, pre-stream.
- Implement reductions for mass, forces and maximum velocity without moving
  full populations back to JavaScript.

### Stage C — application backend

- Introduce the backend interface without changing the CPU reference path.
- Reuse the Phase 2.0 generation, pause/reset, visibility and no-catch-up
  lifecycle contract.
- Select WebGPU only after successful initialization and a lightweight health
  check; otherwise report the fallback reason.

### Stage D — validation and release

- Re-run GPU-specific equivalents of INV-1…INV-6 and WK lifecycle gates.
- Re-run BM-1 and BM-3 against their physical references; keep BM-2 as the
  documented reporting benchmark.
- Test multiple browser/GPU vendors and record exact adapter/browser versions.
- Publish a backend comparison with accuracy, speed, memory and supported-grid
  limits before changing any public performance claim.

## 5. Safety and resource policy

WebGPU runs through the browser and graphics driver sandbox. A heavy simulation
can increase fan speed, power use and temperature like a game or rendering
workload, but SOPLO must bound allocations and dispatch duration, handle device
loss, suspend in hidden tabs and expose a stop/reset path. It must never probe
for maximum load indefinitely or promise identical performance across devices.

## 6. Release gates

WebGPU is shippable only when:

- unsupported or failed devices fall back to the validated CPU Worker;
- GPU tolerances are derived from precision analysis and measurements, not
  copied from the `Float64` suite or loosened until tests pass;
- invariant and benchmark evidence is recorded for the GPU backend;
- physical warnings and validity limits are identical or more conservative;
- the measured speedup justifies the additional backend complexity; and
- HTTPS deployment, device loss, visibility suspension and memory limits have
  browser-level coverage.

Until those gates have a dedicated implementation spec and evidence, WebGPU
remains a roadmap item and no GPU result may be described as validated.

## 7. References

- [WebGPU specification](https://www.w3.org/TR/webgpu/)
- [WebGPU Shading Language specification](https://www.w3.org/TR/WGSL/)
- [Current browser-support announcement](https://web.dev/blog/webgpu-supported-major-browsers)
