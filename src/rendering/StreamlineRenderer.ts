// Streamline (smoke-line) renderer.
//
// A pool of particles seeded uniformly across the inlet (x≈1) is advected
// each frame by the local lattice velocity field via bilinear interpolation.
// Each particle keeps a short trail of its recent positions, drawn as a
// fading white line — the iconic wind-tunnel look.
//
// Lives entirely in screen / lattice space; never touches the solver.

const TRAIL_LENGTH = 60;
/** Visual scaling on the velocity. The lattice velocity at u0 = 0.07 lu
 *  would advance a particle by 0.07 cells/frame — too slow to look alive.
 *  ~8 puts us at roughly half a cell per frame, which feels lively. */
const SPEED_FACTOR = 8;
/** Random delay (in frames) staggering respawns so particle reinjection
 *  doesn't pulse synchronously across the whole inlet. */
const RESPAWN_DELAY_MAX = 8;
/** Number of alpha buckets the trail fade is quantised into. More buckets
 *  = smoother fade, more stroke calls per frame. 6 looks clean and is fast. */
const ALPHA_BUCKETS = 6;
/** Maximum opacity at the trail head. Tuned to read clearly on dark
 *  backgrounds without overpowering a viridis field underneath. */
const HEAD_ALPHA = 0.7;

interface TrailPoint {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  trail: TrailPoint[];
  /** y of the inlet seed slot for this particle. Restored on respawn. */
  seedY: number;
  /** Frames remaining before this particle starts moving again. */
  respawnDelay: number;
}

/** Bilinear interpolation of a scalar field stored as f[x*Ny + y]. */
function bilerp(
  field: Float32Array,
  x: number,
  y: number,
  Nx: number,
  Ny: number,
): number {
  if (x < 0 || x > Nx - 1 || y < 0 || y > Ny - 1) return 0;
  const x0 = Math.min(Nx - 2, Math.max(0, Math.floor(x)));
  const y0 = Math.min(Ny - 2, Math.max(0, Math.floor(y)));
  const fx = x - x0;
  const fy = y - y0;
  const v00 = field[x0 * Ny + y0];
  const v10 = field[(x0 + 1) * Ny + y0];
  const v01 = field[x0 * Ny + (y0 + 1)];
  const v11 = field[(x0 + 1) * Ny + (y0 + 1)];
  return (
    v00 * (1 - fx) * (1 - fy) +
    v10 * fx * (1 - fy) +
    v01 * (1 - fx) * fy +
    v11 * fx * fy
  );
}

export class StreamlineRenderer {
  private particles: Particle[] = [];
  private currentNy = 0;
  /** User-tunable: number of streamlines and animation speed. */
  animationSpeed: number;

  constructor(initialCount = 200, animationSpeed = 1.0) {
    this.animationSpeed = animationSpeed;
    // Seed lazily — caller invokes reset() once it knows Ny.
    this.particles = new Array(0);
    void initialCount;
  }

  /** Reseed all particles uniformly across [0, Ny] with random initial age
   *  so the first frame doesn't look like a synchronised pulse. */
  reset(Ny: number, count?: number): void {
    this.currentNy = Ny;
    const n = count ?? this.particles.length;
    this.particles = [];
    for (let i = 0; i < n; i++) {
      this.particles.push(this.makeParticle(i, n, Ny, true));
    }
  }

  private makeParticle(
    idx: number,
    total: number,
    Ny: number,
    stagger: boolean,
  ): Particle {
    const seedY = ((idx + 0.5) * Ny) / total;
    return {
      x: 1,
      y: seedY,
      age: 0,
      trail: [],
      seedY,
      respawnDelay: stagger ? Math.floor(Math.random() * TRAIL_LENGTH) : 0,
    };
  }

  /** Adjust the active particle count without resetting unaffected ones. */
  setCount(count: number): void {
    if (count === this.particles.length) return;
    const Ny = this.currentNy;
    if (count > this.particles.length) {
      for (let i = this.particles.length; i < count; i++) {
        this.particles.push(this.makeParticle(i, count, Ny, true));
      }
    } else {
      this.particles.length = count;
    }
    // Re-stripe seed positions across the (possibly new) total.
    for (let i = 0; i < count; i++) {
      this.particles[i].seedY = ((i + 0.5) * Ny) / count;
    }
  }

  /** Advect particles one frame. Should be called after the LBM step. */
  step(
    ux: Float32Array,
    uy: Float32Array,
    solid: Uint8Array,
    Nx: number,
    Ny: number,
  ): void {
    if (Ny !== this.currentNy && this.currentNy > 0) {
      // Domain Ny changed (e.g. tunnel resize) — re-stripe seeds.
      this.currentNy = Ny;
      const n = this.particles.length;
      for (let i = 0; i < n; i++) {
        this.particles[i].seedY = ((i + 0.5) * Ny) / n;
      }
    }
    const sf = SPEED_FACTOR * this.animationSpeed;

    for (const p of this.particles) {
      if (p.respawnDelay > 0) {
        p.respawnDelay--;
        continue;
      }

      const u = bilerp(ux, p.x, p.y, Nx, Ny);
      const v = bilerp(uy, p.x, p.y, Nx, Ny);
      const newX = p.x + u * sf;
      const newY = p.y + v * sf;

      // Append previous position to trail head, evict oldest at the tail.
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > TRAIL_LENGTH) p.trail.pop();

      // Out-of-domain or hit a solid cell → respawn at the inlet.
      if (newX < 1 || newX >= Nx - 1 || newY < 1 || newY >= Ny - 1) {
        this.respawn(p);
        continue;
      }
      const ix = Math.floor(newX);
      const iy = Math.floor(newY);
      if (solid[ix * Ny + iy] === 1) {
        this.respawn(p);
        continue;
      }

      p.x = newX;
      p.y = newY;
      p.age++;
    }
  }

  private respawn(p: Particle): void {
    p.x = 1;
    // Tiny y-jitter so respawning particles don't all land on identical lines.
    p.y = p.seedY + (Math.random() - 0.5) * 2;
    p.age = 0;
    p.trail.length = 0;
    p.respawnDelay = Math.floor(Math.random() * RESPAWN_DELAY_MAX);
  }

  /**
   * Draw all particle trails onto the canvas. Lattice y grows up but the
   * canvas y grows down — we apply the flip here so the visualisation
   * matches the field render in Canvas2D.
   *
   * Trails are split into alpha buckets so we issue ALPHA_BUCKETS strokes
   * per frame instead of one stroke per segment (~12 000 segments).
   */
  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    Nx: number,
    Ny: number,
  ): void {
    if (this.particles.length === 0) return;
    const sx = w / Nx;
    const sy = h / Ny;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;

    const buckets: Path2D[] = new Array(ALPHA_BUCKETS);
    for (let b = 0; b < ALPHA_BUCKETS; b++) buckets[b] = new Path2D();

    for (const p of this.particles) {
      if (p.respawnDelay > 0) continue;
      const len = p.trail.length;
      if (len < 1) continue;

      let prevX = p.x * sx;
      let prevY = (Ny - p.y) * sy;
      for (let i = 0; i < len; i++) {
        const t = p.trail[i];
        const x = t.x * sx;
        const y = (Ny - t.y) * sy;
        // alpha = 1 at head, 0 at tail.
        const alpha = 1 - i / TRAIL_LENGTH;
        const b = Math.min(
          ALPHA_BUCKETS - 1,
          Math.max(0, Math.floor(alpha * ALPHA_BUCKETS)),
        );
        buckets[b].moveTo(prevX, prevY);
        buckets[b].lineTo(x, y);
        prevX = x;
        prevY = y;
      }
    }

    for (let b = 0; b < ALPHA_BUCKETS; b++) {
      const alpha = ((b + 0.5) / ALPHA_BUCKETS) * HEAD_ALPHA;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.stroke(buckets[b]);
    }
  }
}
