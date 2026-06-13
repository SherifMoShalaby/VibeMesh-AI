import type { ReactNode, SVGProps } from 'react'

/** Vibemesh icon set — one language, three signatures:
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

/* isometric cube hull shared by the shading trio */
const CUBE = 'M8 1.6 13.5 4.8v6.4L8 14.4 2.5 11.2V4.8z'
const CUBE_TOP = 'M8 1.6 13.5 4.8 8 8 2.5 4.8z'
const CUBE_LEFT = 'M2.5 4.8 8 8v6.4L2.5 11.2z'

export const IconSolid = () => (
  <I>
    <path d={CUBE} />
    <path d={CUBE_TOP} fill="currentColor" fillOpacity="0.85" stroke="none" />
    <path d={CUBE_LEFT} fill="currentColor" fillOpacity="0.4" stroke="none" />
  </I>
)

export const IconEdges = () => (
  <I>
    <path d={CUBE} />
    <path d={CUBE_TOP} fill="currentColor" fillOpacity="0.18" stroke="none" />
    <path d="M8 8v6.4M8 8l5.5-3.2M8 8 2.5 4.8" />
  </I>
)

export const IconWire = () => (
  <I>
    <path d={CUBE} />
    <path d="M8 8v6.4M8 8l5.5-3.2M8 8 2.5 4.8" />
    <path d="M2.5 4.8l11 6.4M13.5 4.8l-11 6.4" strokeOpacity="0.4" strokeWidth="1.1" />
  </I>
)

/** the build plate as an isometric slab */
export const IconBed = () => (
  <I>
    <path d="M8 5.4 14.2 8.4 8 11.4 1.8 8.4z" fill="currentColor" fillOpacity="0.25" />
    <path d="M1.8 8.4v1.7L8 13.1l6.2-3V8.4M8 11.4v1.7" strokeOpacity="0.8" />
  </I>
)

export const IconPersp = () => (
  <I>
    <path d="M3.4 3.2h9.2l2 9.6H1.4z" />
    <path d="M5.7 6.1h4.6l1 4.7H4.7z" fill="currentColor" fillOpacity="0.15" strokeOpacity="0.55" strokeWidth="1.1" />
  </I>
)

export const IconOrtho = () => (
  <I>
    <path d="M2.4 4.9 5.3 2h8.2l-2.9 2.9z" fill="currentColor" fillOpacity="0.22" />
    <path d="M13.5 2v8.2l-2.9 2.9V4.9z" fill="currentColor" fillOpacity="0.12" />
    <rect x="2.4" y="4.9" width="8.2" height="8.2" />
    <path d="M2.4 4.9 5.3 2h8.2l-2.9 2.9M13.5 2v8.2l-2.9 2.9" />
  </I>
)

/** a cutting plane passing through the part */
export const IconSection = () => (
  <I>
    <path d={CUBE} strokeOpacity="0.4" />
    <path d="M1.6 8 8 4.9 14.4 8 8 11.1z" fill="currentColor" fillOpacity="0.2" />
  </I>
)

/** engineering dimension line: |←———→| */
export const IconMeasure = () => (
  <I>
    <path d="M2.2 4.8v6.4M13.8 4.8v6.4" />
    <path d="M2.2 8h11.6" strokeWidth="1.3" />
    <path d="M4.9 5.9 2.8 8l2.1 2.1M11.1 5.9 13.2 8l-2.1 2.1" strokeWidth="1.3" />
  </I>
)

/** camera with a hex lens */
export const IconCamera = () => (
  <I>
    <rect x="1.8" y="4.6" width="12.4" height="8.8" rx="1.2" />
    <path d="M5.5 4.6 6.5 2.8h3l1 1.8" />
    <path d="M8 6.5l2 1.15v2.3L8 11.1 6 9.95v-2.3z" fill="currentColor" fillOpacity="0.22" />
  </I>
)

export const IconUndo = () => (
  <I>
    <path d="M5.4 2.9 2.6 5.7l2.8 2.8" />
    <path d="M2.6 5.7h6.7a4.1 4.1 0 0 1 0 8.2H6.5" />
  </I>
)

export const IconRedo = () => (
  <I>
    <path d="M10.6 2.9l2.8 2.8-2.8 2.8" />
    <path d="M13.4 5.7H6.7a4.1 4.1 0 0 0 0 8.2h2.8" />
  </I>
)

/** hexagon badge, not a circle */
export const IconHelp = () => (
  <I>
    <path d="M8 1.6 13.6 4.8v6.4L8 14.4 2.4 11.2V4.8z" />
    <path d="M6.4 6.3a1.6 1.6 0 1 1 2.45 1.35c-.5.32-.85.65-.85 1.25" />
    <circle cx="8" cy="11.2" r="0.65" fill="currentColor" stroke="none" />
  </I>
)

export const IconChevronDown = () => (
  <I>
    <path d="M4.2 6.3l3.8 3.8 3.8-3.8" />
  </I>
)

export const IconChevronUp = () => (
  <I>
    <path d="M4.2 9.7l3.8-3.8 3.8 3.8" />
  </I>
)

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

/** settings = a hex nut, not a gear */
export const IconGear = () => (
  <I>
    <path d="M2 8l3-5.2h6L14 8l-3 5.2H5z" fill="currentColor" fillOpacity="0.14" />
    <circle cx="8" cy="8" r="2.2" />
  </I>
)

export const IconDownload = () => (
  <I>
    <path d="M8 2v7.4M4.8 6.6 8 9.8l3.2-3.2" />
    <path d="M2.4 10.6v1.8a1.1 1.1 0 0 0 1.1 1.1h9a1.1 1.1 0 0 0 1.1-1.1v-1.8" />
  </I>
)

/** faceted mountains + node-dot sun */
export const IconImage = () => (
  <I>
    <rect x="1.8" y="3" width="12.4" height="10" rx="1.2" />
    <path d="M3.3 11.3l3-3.4 2 2.2 2.1-2.9 2.4 3" />
    <circle cx="5.7" cy="5.9" r="1.05" fill="currentColor" stroke="none" />
  </I>
)

export const IconWarning = () => (
  <I>
    <path d="M8 2.3 14 12.9H2z" />
    <path d="M8 6.3v3" />
    <circle cx="8" cy="11.2" r="0.6" fill="currentColor" stroke="none" />
  </I>
)

export const IconCompare = () => (
  <I>
    <path d="M2.4 5.4h8.2M8.4 3l2.6 2.4L8.4 7.8" />
    <path d="M13.6 10.6H5.4M7.6 8.2 5 10.6l2.6 2.4" />
  </I>
)

export const IconPencil = () => (
  <I>
    <path d="M3 13l.9-3.1 7-7a1.55 1.55 0 0 1 2.2 2.2l-7 7L3 13z" />
    <path d="M9.7 4.1l2.2 2.2" strokeOpacity="0.6" strokeWidth="1.2" />
  </I>
)

export const IconStop = () => (
  <I>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" />
  </I>
)

export const IconRefresh = () => (
  <I>
    <path d="M13.4 8a5.4 5.4 0 1 1-1.7-3.9" />
    <path d="M13.6 2.3v3.1h-3.1" />
  </I>
)

export const IconClock = () => (
  <I>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 4.6V8l2.3 1.5" />
  </I>
)

export const IconCheck = () => (
  <I>
    <path d="M2.8 8.6l3.2 3.2 7.2-7.2" />
  </I>
)

export const IconMove = () => (
  <I>
    <path d="M8 2v12M2 8h12" />
    <path d="M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8" />
  </I>
)

export const IconRotate = () => (
  <I>
    <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
    <path d="M2.4 2.3v3.1h3.1" />
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

export const IconCopy = () => (
  <I>
    <rect x="5.6" y="5.6" width="8" height="8" rx="1.2" />
    <path d="M3.2 10.6v-7a1.2 1.2 0 0 1 1.2-1.2h7" />
  </I>
)

export const IconWrench = () => (
  <I>
    <path d="M13.6 4.6a3.4 3.4 0 0 1-4.4 4L5 12.8a1.55 1.55 0 0 1-2.2-2.2L7 6.4a3.4 3.4 0 0 1 4-4.4L8.8 4.2l.4 2.6 2.6.4 2.2-2.2z" />
  </I>
)

export const IconBulb = () => (
  <I>
    <path d="M8 1.8a4.1 4.1 0 0 1 2.4 7.4c-.5.4-.7 1-.7 1.5H6.3c0-.5-.2-1.1-.7-1.5A4.1 4.1 0 0 1 8 1.8z" />
    <path d="M6.3 12.6h3.4M6.9 14.2h2.2" />
  </I>
)

/** two isometric parts side by side */
export const IconParts = () => (
  <I>
    <path d="M5.2 3.2l2.7 1.6v3.1L5.2 9.5 2.5 7.9V4.8z" fill="currentColor" fillOpacity="0.18" />
    <path d="M10.8 6.4l2.7 1.6v3.1l-2.7 1.6-2.7-1.6V8z" />
  </I>
)

export const IconSend = () => (
  <I>
    <path d="M13.9 2.1 7.5 8.5M13.9 2.1 9.6 13.8 7.5 8.5 2.2 6.4z" />
  </I>
)
