import type { ReactNode, SVGProps } from 'react'

/** Vibemesh-AI icon set — one language, three signatures:
    · 3D concepts drawn in the logo's isometric projection (cubes, bed, parts, drop)
    · hexagons where generic sets use circles (help badge, camera lens, settings = hex nut)
    · filled node-dots echoing the logo's mesh vertices
    16-grid · 1.5 stroke · round caps/joins · currentColor. */
function I({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconX = () => (
  <I>
    <path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" />
  </I>
)

export const IconTrash = () => (
  <I>
    <path d="M2.9 4.4h10.2M6.3 4.4V3.1a.7.7 0 0 1 .7-.7h2a.7.7 0 0 1 .7.7v1.3M4.5 4.4l.6 8.4a1.1 1.1 0 0 0 1.1 1h3.6a1.1 1.1 0 0 0 1.1-1l.6-8.4" />
    <path d="M6.6 7v4M9.4 7v4" strokeOpacity="0.6" strokeWidth="1.2" />
  </I>
)

export const IconWarning = () => (
  <I>
    <path d="M8 2.3 14 12.9H2z" />
    <path d="M8 6.3v3" />
    <circle cx="8" cy="11.2" r="0.6" fill="currentColor" stroke="none" />
  </I>
)

export const IconRefresh = () => (
  <I>
    <path d="M13.4 8a5.4 5.4 0 1 1-1.7-3.9" />
    <path d="M13.6 2.3v3.1h-3.1" />
  </I>
)

/** crosshair with a mesh-node center */
export const IconCenter = () => (
  <I>
    <path d="M8 1.6v2.6M8 11.8v2.6M1.6 8h2.6M11.8 8h2.6" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </I>
)

/** part dropping onto the iso plate */
export const IconDrop = () => (
  <I>
    <path d="M8 1.8v5.6M5.3 5 8 7.7 10.7 5" />
    <path d="M8 9.3l4.8 2.3L8 13.9 3.2 11.6z" fill="currentColor" fillOpacity="0.22" />
  </I>
)

/* ───────────────────────────────────────────────────────────────
   "Machined" design icon set.
   24px viewBox · 1.7 stroke · round caps/joins · currentColor.
   Used by the redesigned cockpit chrome (topbar, tool rail, HUD,
   empty state, chat, menus).
   ─────────────────────────────────────────────────────────────── */
function D({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const DLogo = () => (
  <D>
    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
    <path d="M3 7l9 5 9-5" />
    <path d="M12 12v10" />
  </D>
)
export const DSpark = () => (
  <D>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </D>
)
export const DSparkFill = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.7 5.1 5.1 1.7-5.1 1.7L12 16l-1.7-5.5L5.2 8.8l5.1-1.7L12 2Z" />
  </svg>
)
export const DUser = () => (
  <D>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </D>
)
export const DSend = () => (<D><path d="M4 12h14M12 5l7 7-7 7" /></D>)
export const DPlus = () => (<D><path d="M12 5v14M5 12h14" /></D>)
export const DHistory = () => (<D><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4l3 2" /></D>)
export const DChevDown = () => (<D><path d="M6 9l6 6 6-6" /></D>)
export const DChevRight = () => (<D><path d="M9 6l6 6-6 6" /></D>)
export const DCheck = () => (<D><path d="M5 12.5 10 17l9-10" /></D>)
export const DDownload = () => (<D><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></D>)
export const DImage = () => (<D><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 4.5-4.5 4 4L16 13l4 4" /></D>)
export const DCode = () => (<D><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></D>)
export const DSliders = () => (<D><path d="M4 8h9M17 8h3M4 16h3M11 16h9M14 5v6M8 13v6" /></D>)
export const DReset = () => (<D><path d="M3.5 9a9 9 0 1 1-.6 5" /><path d="M3 4v5h5" /></D>)
export const DCopy = () => (<D><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></D>)
export const DRestore = () => (<D><path d="M3.5 9a9 9 0 1 1-.6 5" /><path d="M3 4v5h5" /></D>)
export const DGauge = () => (<D><path d="M12 13l4-4" /><path d="M4.5 18a9 9 0 1 1 15 0" /><circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" /></D>)
export const DPrinter = () => (<D><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M8 17h8v4H8z" /><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" /></D>)
export const DMove = () => (<D><path d="M12 3v18M3 12h18M8 6l4-3 4 3M8 18l4 3 4-3M6 8l-3 4 3 4M18 8l3 4-3 4" /></D>)
export const DRotate = () => (<D><path d="M3.5 9a9 9 0 1 1-.6 5" /><path d="M3 4v5h5" /></D>)
export const DZoom = () => (<D><circle cx="11" cy="11" r="7" /><path d="M16 16l4 4M9 11h4M11 9v4" /></D>)
export const DRuler = () => (<D><path d="M3 16h18M6 16v-3M10 16v-5M14 16v-3M18 16v-5" /></D>)
export const DSection = () => (<D><path d="M4 12h16M4 12l4-4M4 12l4 4" /><rect x="4" y="4" width="16" height="16" rx="2" opacity=".4" /></D>)
export const DGrid = () => (<D><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></D>)
export const DCube = () => (<D><path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" /><path d="M3 7l9 4.5L21 7M12 11.5V22" /></D>)
export const DArrowRight = () => (<D><path d="M5 12h14M13 6l6 6-6 6" /></D>)
export const DBox = () => (<D><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" /><path d="M3 8l9 5 9-5M12 13v8" /></D>)
export const DCamera = () => (<D><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></D>)
export const DCylinder = () => (<D><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12a7 3 0 0 0 14 0V6" /></D>)
export const DLayers = () => (<D><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5M3 16.5l9 5 9-5" opacity=".55" /></D>)
export const DChip = () => (<D><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></D>)
export const DRefresh = () => (<D><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></D>)
export const DWrench = () => (<D><path d="M15 6a4 4 0 0 0-5 5L4 17l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5L13 9l1.5-3Z" /></D>)
export const DUndo = () => (<D><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></D>)
