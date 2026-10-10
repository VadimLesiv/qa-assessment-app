/**
 * Card fronts and backs are stored as a small HTML subset. Everything that is
 * rendered goes through `sanitizeHtml` first, so stored markup can never run
 * script. Legacy cards hold plain text; those are escaped and keep their line
 * breaks.
 */

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN', 'A', 'PRE', 'CODE', 'IMG', 'FONT',
]);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const SAFE_LINK_RE = /^(https?:|mailto:)/i;
const SAFE_IMG_RE = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

const HTML_HINT_RE = /<\/?[a-z][\s\S]*?>/i;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turns stored text (plain legacy or HTML) into HTML. */
export function toHtml(value: string): string {
  if (HTML_HINT_RE.test(value)) return value;
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function cleanNode(node: Node, out: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return out.createTextNode(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  if (DROP_WITH_CONTENT.has(el.tagName)) return null;

  if (!ALLOWED_TAGS.has(el.tagName)) {
    // Unknown wrapper: keep its children, drop the tag.
    const frag = out.createDocumentFragment();
    el.childNodes.forEach((child) => {
      const cleaned = cleanNode(child, out);
      if (cleaned) frag.appendChild(cleaned);
    });
    return frag;
  }

  const clean = out.createElement(el.tagName.toLowerCase());
  if (el.tagName === 'A') {
    const href = el.getAttribute('href')?.trim() ?? '';
    if (SAFE_LINK_RE.test(href)) {
      clean.setAttribute('href', href);
      clean.setAttribute('target', '_blank');
      clean.setAttribute('rel', 'noopener noreferrer');
    }
  } else if (el.tagName === 'IMG') {
    const src = el.getAttribute('src')?.trim() ?? '';
    if (!SAFE_IMG_RE.test(src)) return null;
    clean.setAttribute('src', src);
    clean.setAttribute('alt', el.getAttribute('alt') ?? '');
  } else if (el.tagName === 'FONT') {
    const color = el.getAttribute('color')?.trim() ?? '';
    if (COLOR_RE.test(color)) clean.setAttribute('color', color);
  } else if (el.tagName === 'SPAN') {
    const color = el.style.color?.trim();
    if (color && COLOR_RE.test(color)) clean.setAttribute('style', `color: ${color}`);
  }

  el.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, out);
    if (cleaned) clean.appendChild(cleaned);
  });
  return clean;
}

export function sanitizeHtml(value: string): string {
  const parsed = new DOMParser().parseFromString(toHtml(value), 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const root = out.createElement('div');
  parsed.body.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, out);
    if (cleaned) root.appendChild(cleaned);
  });
  return root.innerHTML;
}

/** Plain-text version for compact previews and labels. */
export function htmlToText(value: string): string {
  const parsed = new DOMParser().parseFromString(
    toHtml(value).replace(/<\/(p|div|li|pre)>|<br\s*\/?>/gi, ' $&'),
    'text/html',
  );
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** True when the markup has visible text or an image. */
export function hasContent(value: string): boolean {
  return htmlToText(value) !== '' || /<img\s/i.test(value);
}
