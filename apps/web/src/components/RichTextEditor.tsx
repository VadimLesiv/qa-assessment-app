import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { sanitizeHtml } from '../lib/richtext';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label: string;
}

const MAX_IMAGE_SIDE = 640;

/** Shrinks a picked image to a compact JPEG/PNG data URL so cards stay small. */
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const keepAlpha = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
      resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

interface ToolButtonProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  children: ReactNode;
}

function ToolButton({ label, onClick, active, disabled, tooltip, children }: ToolButtonProps) {
  return (
    // The wrapper carries the tooltip because disabled buttons don't show their own.
    <span className="rte-tool-wrap" title={tooltip ?? label}>
      <button
        type="button"
        className={`rte-tool${active ? ' rte-tool--active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        // Keep the text selection inside the editor when a tool is pressed.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {children}
      </button>
    </span>
  );
}

export function RichTextEditor({ value, onChange, placeholder, autoFocus, label }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(!value);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  // Seed once; afterwards the DOM is the source of truth (a controlled
  // contentEditable would reset the caret on every keystroke).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = sanitizeHtml(value);
    setEmpty(!el.textContent && !el.querySelector('img'));
    if (autoFocus) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setEmpty(!el.textContent && !el.querySelector('img'));
    onChange(el.innerHTML);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    savedRange.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
      code: !!(sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('pre')),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive);
    return () => document.removeEventListener('selectionchange', refreshActive);
  }, [refreshActive]);

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    // Keyboard actions happen with the caret already in the editor; the saved
    // range can be stale (selectionchange lags behind typing), so keep the live one.
    const live = window.getSelection();
    if (document.activeElement === el && live?.anchorNode && el.contains(live.anchorNode)) return;
    el.focus();
    const range = savedRange.current;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const exec = (command: string, arg?: string) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    emit();
    refreshActive();
  };

  const toggleCode = () => {
    restoreSelection();
    const sel = window.getSelection();
    const inPre = !!sel?.anchorNode?.parentElement?.closest('pre');
    document.execCommand('formatBlock', false, inPre ? 'div' : 'pre');
    emit();
    refreshActive();
  };

  const insertLink = () => {
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = !!sel && !sel.isCollapsed;
    const input = window.prompt('Link address (https://…)', 'https://');
    if (!input) return;
    const url = /^(https?:|mailto:)/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
    restoreSelection();
    if (hasSelection) {
      document.execCommand('createLink', false, url);
    } else {
      const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      document.execCommand('insertHTML', false, `<a href="${safe}">${safe}</a>`);
    }
    emit();
  };

  const onImagePicked = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const dataUrl = await readImage(file);
      restoreSelection();
      document.execCommand('insertImage', false, dataUrl);
      emit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that image');
    }
  };

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        <ToolButton label="Bold" active={active.bold} onClick={() => exec('bold')}>
          <b>B</b>
        </ToolButton>
        <ToolButton label="Italic" active={active.italic} onClick={() => exec('italic')}>
          <i>I</i>
        </ToolButton>
        <ToolButton label="Underline" active={active.underline} onClick={() => exec('underline')}>
          <u>U</u>
        </ToolButton>
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton label="Bulleted list" active={active.ul} onClick={() => exec('insertUnorderedList')}>
          •≡
        </ToolButton>
        <ToolButton label="Numbered list" active={active.ol} onClick={() => exec('insertOrderedList')}>
          1.
        </ToolButton>
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton label="Font color" onClick={() => colorRef.current?.click()}>
          <span className="rte-color-glyph">A</span>
        </ToolButton>
        <input
          ref={colorRef}
          type="color"
          className="rte-hidden-input"
          tabIndex={-1}
          aria-hidden="true"
          defaultValue="#bf3550"
          onChange={(e) => exec('foreColor', e.target.value)}
        />
        <ToolButton label="Insert link" onClick={insertLink}>
          🔗
        </ToolButton>
        <ToolButton label="Code block" active={active.code} onClick={toggleCode}>
          {'</>'}
        </ToolButton>
        <ToolButton label="Add image" onClick={() => fileRef.current?.click()}>
          🖼
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="rte-hidden-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void onImagePicked(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton label="Text to speech" disabled tooltip="Will be added soon">
          🔊
        </ToolButton>
        <ToolButton label="AI: word, definition, example" disabled tooltip="Will be added soon">
          ✨ AI
        </ToolButton>
      </div>
      <div
        ref={editorRef}
        className="rte-editor rich-content"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-empty={empty}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const anchor = window.getSelection()?.anchorNode;
          const inList = !!anchor && !!(anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement)?.closest('li');
          // Outside a list Tab keeps its normal job of moving focus.
          if (!inList) return;
          e.preventDefault();
          exec(e.shiftKey ? 'outdent' : 'indent');
        }}
        onPaste={(e) => {
          // Paste as plain text so foreign styling never leaks into a card.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
      />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
