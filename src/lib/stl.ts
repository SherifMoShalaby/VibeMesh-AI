import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

const loader = new STLLoader()

export interface ModelGeometry {
  geometry: THREE.BufferGeometry
  /** size in mm along x/y/z */
  size: { x: number; y: number; z: number }
  /** lowest z of the model (to check it sits on the bed) */
  minZ: number
  center: { x: number; y: number }
  triangles: number
}

export function parseStl(buffer: ArrayBuffer): ModelGeometry {
  const geometry = loader.parse(buffer)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const size = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  }
  return {
    geometry,
    size,
    minZ: box.min.z,
    center: { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 },
    triangles: geometry.getAttribute('position').count / 3,
  }
}

export interface StlBBox {
  x: number
  y: number
  z: number
  minZ: number
}

/** Lightweight binary-STL bounding box (no three.js geometry allocation). */
export function stlBBox(buffer: ArrayBuffer): StlBBox | null {
  if (buffer.byteLength < 84) return null
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  if (buffer.byteLength < 84 + count * 50) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    for (let v = 0; v < 3; v++) {
      for (let a = 0; a < 3; a++) {
        const val = view.getFloat32(base + v * 12 + a * 4, true)
        if (val < min[a]) min[a] = val
        if (val > max[a]) max[a] = val
      }
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return { x: r(max[0] - min[0]), y: r(max[1] - min[1]), z: r(max[2] - min[2]), minZ: r(min[2]) }
}

/**
 * Apply a 4×4 transform (column-major, THREE.Matrix4.elements) to every vertex
 * of a binary STL, recomputing facet normals. Pure DataView math — used to bake
 * viewport move/rotate into exports so what you see is what you print.
 */
export function transformStl(buffer: ArrayBuffer, m: number[]): ArrayBuffer {
  const src = new DataView(buffer)
  const count = src.getUint32(80, true)
  const out = buffer.slice(0)
  const dst = new DataView(out)
  const v: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50
    for (let k = 0; k < 3; k++) {
      const off = base + 12 + k * 12
      const x = src.getFloat32(off, true)
      const y = src.getFloat32(off + 4, true)
      const z = src.getFloat32(off + 8, true)
      v[k][0] = m[0] * x + m[4] * y + m[8] * z + m[12]
      v[k][1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      v[k][2] = m[2] * x + m[6] * y + m[10] * z + m[14]
      dst.setFloat32(off, v[k][0], true)
      dst.setFloat32(off + 4, v[k][1], true)
      dst.setFloat32(off + 8, v[k][2], true)
    }
    // facet normal = normalize((v1-v0) × (v2-v0))
    const ax = v[1][0] - v[0][0]
    const ay = v[1][1] - v[0][1]
    const az = v[1][2] - v[0][2]
    const bx = v[2][0] - v[0][0]
    const by = v[2][1] - v[0][1]
    const bz = v[2][2] - v[0][2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    dst.setFloat32(base, nx, true)
    dst.setFloat32(base + 4, ny, true)
    dst.setFloat32(base + 8, nz, true)
  }
  return out
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
