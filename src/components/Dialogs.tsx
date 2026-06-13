import { useEffect, useState } from 'react'
import type { BedSize } from '../types'
import { IconX } from './icons'

/** Esc closes — capture phase so the viewport's Esc-to-deselect never sees it. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
}

/** Branded replacement for window.confirm (UX-AUDIT F12). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscape(onCancel)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <p className="dialog-body">{body}</p>
        </div>
        <div className="modal-foot dialog-foot">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'stop' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Branded replacement for the window.prompt custom-bed flow (UX-AUDIT F12). */
export function CustomBedDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: BedSize
  onSave: (bed: BedSize) => void
  onCancel: () => void
}) {
  useEscape(onCancel)
  const [x, setX] = useState(String(initial.x))
  const [y, setY] = useState(String(initial.y))
  const [z, setZ] = useState(String(initial.z))

  const nums = [Number(x), Number(y), Number(z)]
  const valid = nums.every((n) => Number.isFinite(n) && n >= 10 && n <= 2000)

  const save = () => {
    if (valid) onSave({ x: nums[0], y: nums[1], z: nums[2] })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Custom bed size" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Custom bed size</span>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <p className="dialog-body">Your printer's build volume, in millimeters.</p>
          <div className="bed-fields" onKeyDown={(e) => e.key === 'Enter' && save()}>
            <label>
              <span>Width (X)</span>
              <input type="number" min={10} max={2000} value={x} onChange={(e) => setX(e.target.value)} autoFocus />
            </label>
            <label>
              <span>Depth (Y)</span>
              <input type="number" min={10} max={2000} value={y} onChange={(e) => setY(e.target.value)} />
            </label>
            <label>
              <span>Height (Z)</span>
              <input type="number" min={10} max={2000} value={z} onChange={(e) => setZ(e.target.value)} />
            </label>
          </div>
          {!valid && <p className="dialog-note">Each side must be between 10 and 2000&nbsp;mm.</p>}
        </div>
        <div className="modal-foot dialog-foot">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Save bed
          </button>
        </div>
      </div>
    </div>
  )
}
