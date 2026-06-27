import { useEffect, useRef, useState } from 'react'
import type { BedSize } from '../types'
import { useUi } from '../state/ui'
import { useFocusTrap } from '../lib/useFocusTrap'
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
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  return (
    <div className="scrim" onClick={onCancel}>
      <div ref={dialogRef} tabIndex={-1} className="modal modal-sm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-text">
            <h2>{title}</h2>
          </div>
          <button className="icon-btn-sm" onClick={onCancel} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <p className="dialog-body">{body}</p>
        </div>
        <div className="modal-foot dialog-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Transient notices — the branded replacement for window.alert (UX-AUDIT F12). Errors stay
 *  loud (per SPEC §4 export-failure rule); both levels are manually dismissible. */
export function Toaster() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <IconX />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Renders the branded confirm when the store's promise-based requestConfirm is pending. */
export function ConfirmHost() {
  const req = useUi((s) => s.confirmRequest)
  if (!req) return null
  const close = (ok: boolean) => {
    req.resolve(ok)
    useUi.setState({ confirmRequest: null })
  }
  return (
    <ConfirmDialog
      title={req.title}
      body={req.body}
      confirmLabel={req.confirmLabel}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
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
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  const [x, setX] = useState(String(initial.x))
  const [y, setY] = useState(String(initial.y))
  const [z, setZ] = useState(String(initial.z))

  const nums = [Number(x), Number(y), Number(z)]
  const valid = nums.every((n) => Number.isFinite(n) && n >= 10 && n <= 2000)

  const save = () => {
    if (valid) onSave({ x: nums[0], y: nums[1], z: nums[2] })
  }

  return (
    <div className="scrim" onClick={onCancel}>
      <div ref={dialogRef} tabIndex={-1} className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Custom bed size" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-text">
            <h2>Custom bed size</h2>
          </div>
          <button className="icon-btn-sm" onClick={onCancel} aria-label="Close">
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
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            Save bed
          </button>
        </div>
      </div>
    </div>
  )
}
