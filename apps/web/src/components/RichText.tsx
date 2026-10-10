import type { ElementType } from 'react';
import { sanitizeHtml } from '../lib/richtext';

interface RichTextProps {
  html: string;
  as?: ElementType;
  className?: string;
}

/** Renders stored card markup after sanitizing it. */
export function RichText({ html, as: Tag = 'div', className }: RichTextProps) {
  return <Tag className={`rich-content ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
