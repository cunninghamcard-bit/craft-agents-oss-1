import * as React from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { Bold, Italic, Strikethrough, Code, Pencil } from 'lucide-react'
import { cn } from '../../lib/utils'

// ============================================================================
// Bubble menu toolbar button
// ============================================================================

function BubbleButton({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'tiptap-bubble-btn',
        isActive && 'is-active',
      )}
    >
      {children}
    </button>
  )
}

// ============================================================================
// Text formatting bubble menu — Bold, Italic, Strike, Code
// ============================================================================

function TextFormattingMenu({ editor }: { editor: Editor }) {
  return (
    <div className="tiptap-bubble-menu">
      <BubbleButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </BubbleButton>

      <BubbleButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </BubbleButton>

      <BubbleButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </BubbleButton>

      <BubbleButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Code"
      >
        <Code className="w-3.5 h-3.5" />
      </BubbleButton>
    </div>
  )
}

// ============================================================================
// Code block edit bubble menu — edit popover for mermaid / latex blocks
// ============================================================================

const VISUAL_LANGUAGES = new Set(['mermaid', 'latex', 'math', 'tex', 'katex'])

function languageLabel(lang: string): string {
  switch (lang) {
    case 'mermaid': return 'Mermaid'
    case 'latex':
    case 'math':
    case 'tex':
    case 'katex': return 'LaTeX'
    default: return lang
  }
}

function CodeBlockEditMenu({ editor }: { editor: Editor }) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [code, setCode] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const language = (editor.getAttributes('codeBlock').language as string | undefined)?.toLowerCase() ?? ''

  // Sync code from the editor node when entering edit mode
  const openEditor = React.useCallback(() => {
    const { $from } = editor.state.selection
    // Walk up to find the codeBlock node
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'codeBlock') {
        setCode(node.textContent)
        break
      }
    }
    setIsEditing(true)
  }, [editor])

  // Commit the edited code back into the ProseMirror document
  const commitEdit = React.useCallback(() => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'codeBlock') {
        const pos = $from.before(depth)
        const tr = editor.state.tr.replaceWith(
          pos + 1,
          pos + node.nodeSize - 1,
          code.length > 0 ? editor.schema.text(code) : editor.schema.text(' '),
        )
        editor.view.dispatch(tr)
        break
      }
    }
    setIsEditing(false)
  }, [editor, code])

  // Auto-resize textarea
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [isEditing, code])

  if (!isEditing) {
    return (
      <div className="tiptap-bubble-menu">
        <BubbleButton onClick={openEditor} title={`Edit ${languageLabel(language)}`}>
          <Pencil className="w-3.5 h-3.5" />
        </BubbleButton>
        <span className="tiptap-bubble-label">{languageLabel(language)}</span>
      </div>
    )
  }

  return (
    <div className="tiptap-bubble-menu tiptap-bubble-menu--editing">
      <div className="tiptap-bubble-edit-header">
        <span className="tiptap-bubble-label">{languageLabel(language)}</span>
        <button
          type="button"
          className="tiptap-bubble-done-btn"
          onClick={commitEdit}
        >
          Done
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter to commit
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commitEdit()
          }
          // Prevent TipTap from consuming keypresses inside the textarea
          e.stopPropagation()
        }}
        className="tiptap-bubble-textarea"
        spellCheck={false}
      />
    </div>
  )
}

// ============================================================================
// Inline math edit menu — edit popover for $...$ math nodes
// ============================================================================

function InlineMathEditMenu({ editor, inlineMathClickedRef }: { editor: Editor; inlineMathClickedRef?: React.RefObject<boolean> }) {
  const [latex, setLatex] = React.useState('')
  const [nodePos, setNodePos] = React.useState<number | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Track which node pos we've already synced to avoid re-focusing on every selectionUpdate
  const syncedPosRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const syncFromSelection = () => {
      const { selection } = editor.state
      if (selection instanceof NodeSelection && selection.node.type.name === 'inlineMath') {
        const pos = selection.from
        setLatex(selection.node.attrs.latex as string)
        setNodePos(pos)
        // Only auto-focus when selecting a new/different node (not on every update)
        if (syncedPosRef.current !== pos) {
          syncedPosRef.current = pos
          requestAnimationFrame(() => {
            requestAnimationFrame(() => inputRef.current?.focus())
          })
        }
      } else {
        syncedPosRef.current = null
      }
    }

    syncFromSelection()
    editor.on('selectionUpdate', syncFromSelection)
    return () => { editor.off('selectionUpdate', syncFromSelection) }
  }, [editor])

  // Dismiss: move cursor after the node so BubbleMenu hides
  const dismiss = React.useCallback(() => {
    if (nodePos == null) return
    if (inlineMathClickedRef) (inlineMathClickedRef as React.MutableRefObject<boolean>).current = false
    const node = editor.state.doc.nodeAt(nodePos)
    const afterPos = node ? nodePos + node.nodeSize : nodePos + 1
    editor.chain().focus().setTextSelection(afterPos).run()
  }, [editor, nodePos, inlineMathClickedRef])

  const commitEdit = React.useCallback(() => {
    if (nodePos == null) return
    if (inlineMathClickedRef) (inlineMathClickedRef as React.MutableRefObject<boolean>).current = false
    if (latex.trim().length === 0) {
      editor.chain().focus().deleteInlineMath({ pos: nodePos }).run()
    } else {
      const node = editor.state.doc.nodeAt(nodePos)
      const afterPos = node ? nodePos + node.nodeSize : nodePos + 1
      editor.chain().focus().updateInlineMath({ latex, pos: nodePos }).setTextSelection(afterPos).run()
    }
  }, [editor, latex, nodePos, inlineMathClickedRef])

  return (
    <div className="tiptap-bubble-menu tiptap-bubble-menu--inline-math">
      <input
        ref={inputRef}
        type="text"
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitEdit()
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            dismiss()
            return
          }
          // Arrow left at start of input → commit and place cursor before the node
          if (e.key === 'ArrowLeft' && inputRef.current?.selectionStart === 0) {
            e.preventDefault()
            if (inlineMathClickedRef) (inlineMathClickedRef as React.MutableRefObject<boolean>).current = false
            if (nodePos != null && latex.trim().length > 0) {
              editor.chain().focus().updateInlineMath({ latex, pos: nodePos }).setTextSelection(nodePos).run()
            } else {
              dismiss()
            }
            return
          }
          // Arrow right at end of input → commit and place cursor after the node
          if (e.key === 'ArrowRight' && inputRef.current?.selectionStart === latex.length) {
            e.preventDefault()
            commitEdit()
            return
          }
          e.stopPropagation()
        }}
        onBlur={commitEdit}
        className="tiptap-bubble-math-input"
        spellCheck={false}
      />
    </div>
  )
}

// ============================================================================
// Exported composite: all bubble menus for the TipTap editor
// ============================================================================

export function TiptapBubbleMenus({ editor, inlineMathClickedRef }: { editor: Editor; inlineMathClickedRef?: React.RefObject<boolean> }) {
  return (
    <>
      {/* Text formatting — shows on text selection, hidden in code blocks */}
      <BubbleMenu
        editor={editor}
        pluginKey="textFormatting"
        updateDelay={0}
        shouldShow={({ editor: e, state }) => {
          const { selection } = state
          if (selection.from === selection.to) return false
          if (selection instanceof NodeSelection) return false
          if (e.isActive('codeBlock')) return false
          return true
        }}
        options={{ placement: 'top', offset: 8 }}
      >
        <TextFormattingMenu editor={editor} />
      </BubbleMenu>

      {/* Code block edit — shows when cursor is in a mermaid/latex code block */}
      <BubbleMenu
        editor={editor}
        pluginKey="codeBlockEdit"
        updateDelay={0}
        shouldShow={({ editor: e }) => {
          if (!e.isActive('codeBlock')) return false
          const lang = (e.getAttributes('codeBlock').language as string | undefined)?.toLowerCase()
          return lang != null && VISUAL_LANGUAGES.has(lang)
        }}
        options={{ placement: 'top-start', offset: 8 }}
      >
        <CodeBlockEditMenu editor={editor} />
      </BubbleMenu>

      {/* Inline math edit — shows when an inlineMath node is selected */}
      <BubbleMenu
        editor={editor}
        pluginKey="inlineMathEdit"
        updateDelay={0}
        shouldShow={({ state }) => {
          const { selection } = state
          if (!(selection instanceof NodeSelection && selection.node.type.name === 'inlineMath')) return false
          // Only show on click-initiated selection, not keyboard arrow navigation
          if (inlineMathClickedRef && !inlineMathClickedRef.current) return false
          return true
        }}
        options={{ placement: 'top', offset: 8 }}
      >
        <InlineMathEditMenu editor={editor} inlineMathClickedRef={inlineMathClickedRef} />
      </BubbleMenu>
    </>
  )
}
