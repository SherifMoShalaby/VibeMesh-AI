import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap keyboard focus inside an open modal — honoring the `aria-modal="true"` promise that the
 * rest of the page is inert. On mount it remembers what had focus and moves focus inside; Tab /
 * Shift+Tab loop between the first and last focusable descendants; on unmount it restores focus to
 * the element that opened the modal. Intended for components that mount only while open (the modal
 * returns null when closed), so `active` defaults to true.
 *
 * The container should carry `tabIndex={-1}` so focus has somewhere to land when it holds no
 * focusable controls.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    // getClientRects() is empty for display:none elements and (unlike offsetParent) is reliable
    // inside position:fixed modals.
    const focusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)

    // don't steal focus from an element the dialog already auto-focused (autoFocus runs before
    // this effect); only pull focus in when it's still outside.
    if (!node.contains(document.activeElement)) (focusable()[0] ?? node).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey && (activeEl === first || !node.contains(activeEl))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (activeEl === last || !node.contains(activeEl))) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // restore focus to the trigger so keyboard/SR users don't lose their place
      previouslyFocused?.focus?.()
    }
  }, [ref, active])
}
