/**
 * AI-free Printability Inspector — a green/amber/red verdict computed from the compiled STL +
 * bounding box + bed, surfaced before the user spends filament. Pure mesh/param math (no FEA,
 * no new geometry), off the compile hot path. Every check is advisory and names the specific
 * failing feature. This is the "does it actually print?" promise made VISIBLE.
 *
 * What it checks reliably (and what it deliberately does NOT): exact internal wall-thickness from
 * a triangle soup is a hard 3D medial-axis problem with no cheap, trustworthy estimate, so we do
 * NOT fake it — instead we check the signals that ARE cheap and reliable: bed fit, flat-on-bed,
 * smallest printable feature (vs the nozzle), tall-and-narrow tip-over risk, and unsupported
 * overhang AREA from face normals.
 */

export type PrintLevel = 'ok' | 'warn' | 'fail'

export interface PrintCheck {
  id: string
  level: PrintLevel
  label: string
  detail: string
}

export interface PrintabilityReport {
  level: PrintLevel // worst of the checks
  checks: PrintCheck[]
}

/** Typical FDM nozzle / line width (mm). A feature thinner than ~2 lines is fragile/unprintable. */
export const DEFAULT_NOZZLE = 0.4

const worst = (levels: PrintLevel[]): PrintLevel =>
  levels.includes('fail') ? 'fail' : levels.includes('warn') ? 'warn' : 'ok'

/**
 * Fraction of the model's surface AREA that is a steep DOWN-facing overhang (would need support),
 * excluding the bed-contact bottom layer. Reads a binary STL's facet normals + vertices. 0 when
 * the buffer is malformed. `maxOverhangDeg` is measured from horizontal — a face whose normal
 * points more than this far below horizontal is flagged (45° default ≈ the common support angle).
 */
export function overhangFraction(stl: ArrayBuffer, maxOverhangDeg = 45): number {
  if (!stl || stl.byteLength < 84) return 0
  const view = new DataView(stl)
  const count = view.getUint32(80, true)
  if (stl.byteLength < 84 + count * 50) return 0
  // first pass: minZ (for the bed-contact exclusion)
  let minZ = Infinity
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    for (let v = 0; v < 3; v++) {
      const z = view.getFloat32(base + v * 12 + 8, true)
      if (z < minZ) minZ = z
    }
  }
  const nzThreshold = -Math.cos((maxOverhangDeg * Math.PI) / 180) // normal.z below this ⇒ steep overhang
  let overhang = 0
  let total = 0
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50
    const ax = view.getFloat32(base + 12, true), ay = view.getFloat32(base + 16, true), az = view.getFloat32(base + 20, true)
    const bx = view.getFloat32(base + 24, true), by = view.getFloat32(base + 28, true), bz = view.getFloat32(base + 32, true)
    const cx = view.getFloat32(base + 36, true), cy = view.getFloat32(base + 40, true), cz = view.getFloat32(base + 44, true)
    // triangle area + unit normal from the geometry (the stored normal may be unnormalized/zero)
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const area = len / 2
    total += area
    // skip the bed-contact bottom (supported by the bed, not an overhang)
    const triMaxZ = Math.max(az, bz, cz)
    if (triMaxZ <= minZ + 0.5) continue
    if (nz / len < nzThreshold) overhang += area
  }
  return total > 0 ? overhang / total : 0
}

export interface PrintabilityInput {
  size: { x: number; y: number; z: number }
  minZ: number
  bed: { x: number; y: number; z: number }
  nozzle?: number
  stl?: ArrayBuffer | null
  /** assembly ('all') preview — bed-fit + per-part checks are handled per-piece elsewhere */
  isAssembly?: boolean
}

/** Compute the printability verdict. Deterministic; identical input → identical report. */
export function analyzePrintability(input: PrintabilityInput): PrintabilityReport {
  const { size, minZ, bed, isAssembly } = input
  const nozzle = input.nozzle ?? DEFAULT_NOZZLE
  const checks: PrintCheck[] = []
  const dims = `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}mm`

  // 1. bed fit (skip for the assembly preview — pieces are checked individually)
  if (!isAssembly) {
    const over = size.x > bed.x || size.y > bed.y || size.z > bed.z
    checks.push(
      over
        ? { id: 'bed', level: 'fail', label: "Won't fit the bed", detail: `${dims} exceeds the ${bed.x}×${bed.y}×${bed.z}mm bed — split into parts.` }
        : { id: 'bed', level: 'ok', label: 'Fits the bed', detail: `${dims} within ${bed.x}×${bed.y}×${bed.z}mm.` },
    )
  }

  // 2. flat on the bed
  const off = Math.abs(minZ)
  if (off > 0.5) {
    checks.push({
      id: 'flat',
      level: 'warn',
      label: minZ < 0 ? 'Sinks below the bed' : 'Floats above the bed',
      detail: `Lowest point is ${minZ.toFixed(1)}mm — drop it flat onto z=0 so the first layer adheres.`,
    })
  }

  // 3. smallest printable feature vs the nozzle
  const minDim = Math.min(size.x, size.y, size.z)
  if (minDim < 2 * nozzle) {
    checks.push({ id: 'feature', level: 'fail', label: 'Thinner than 2 print lines', detail: `Smallest dimension ${minDim.toFixed(2)}mm < ${(2 * nozzle).toFixed(1)}mm (2 × ${nozzle}mm nozzle) — it won't form.` })
  } else if (minDim < 1.2) {
    checks.push({ id: 'feature', level: 'warn', label: 'Very thin / fragile', detail: `Smallest dimension ${minDim.toFixed(2)}mm — printable but fragile at a ${nozzle}mm nozzle.` })
  }

  // 4. tall-and-narrow tip-over risk
  const footprint = Math.min(size.x, size.y)
  if (footprint > 0 && size.z > 4 * footprint && size.z > 40) {
    checks.push({ id: 'aspect', level: 'warn', label: 'Tall and narrow', detail: `${size.z.toFixed(0)}mm tall on a ${footprint.toFixed(0)}mm footprint — may wobble; consider a brim or printing it lying down.` })
  }

  // 5. unsupported overhang area (advisory)
  if (input.stl) {
    const frac = overhangFraction(input.stl)
    if (frac > 0.25) checks.push({ id: 'overhang', level: 'warn', label: 'Large overhangs', detail: `~${Math.round(frac * 100)}% of the surface faces steeply downward — likely needs supports.` })
    else if (frac > 0.1) checks.push({ id: 'overhang', level: 'warn', label: 'Some overhangs', detail: `~${Math.round(frac * 100)}% steep down-facing area — may need light supports.` })
  }

  if (!checks.some((c) => c.level !== 'ok')) {
    return { level: 'ok', checks: checks.length ? checks : [{ id: 'ok', level: 'ok', label: 'Looks printable', detail: `${dims}, flat on the bed, no obvious issues.` }] }
  }
  return { level: worst(checks.map((c) => c.level)), checks }
}
