import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { EditorView, Decoration, keymap } from '@codemirror/view'

/**
 * CodeMirror 6 editor for the OpenSCAD program — line numbers, C-like syntax
 * highlighting (OpenSCAD has no first-party CM grammar; cpp() covers braces,
 * numbers, strings, line comments, and call syntax), ⌘/Ctrl-Enter & ⌘/Ctrl-S to
 * apply, and a highlighted gutter+line for the compile error. Replaces the plain
 * textarea + CSS gutter (UX-AUDIT Phase 3 / SPEC §9).
 */

/** Highlight the failing line (1-based). Function-form facet so it re-reads on updates;
 *  recreated when `line` changes, which reconfigures the editor. */
function errorLineExtension(line: number | null) {
  if (!line) return []
  return EditorView.decorations.of((view) => {
    if (line < 1 || line > view.state.doc.lines) return Decoration.none
    const l = view.state.doc.line(line)
    return Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(l.from)])
  })
}

export default function CodeEditor({
  value,
  onChange,
  onApply,
  errorLine,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onApply: () => void
  errorLine: number | null
  placeholder?: string
}) {
  const extensions = useMemo(
    () => [
      cpp(),
      EditorView.lineWrapping,
      keymap.of([
        { key: 'Mod-Enter', preventDefault: true, run: () => (onApply(), true) },
        { key: 'Mod-s', preventDefault: true, run: () => (onApply(), true) },
      ]),
      errorLineExtension(errorLine),
    ],
    [errorLine, onApply],
  )

  return (
    <CodeMirror
      className="cm-host"
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="dark"
      placeholder={placeholder}
      height="100%"
      spellCheck={false}
      basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false, autocompletion: false }}
    />
  )
}
