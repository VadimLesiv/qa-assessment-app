import JSZip from 'jszip';

/**
 * Builds a minimal but structurally valid .pptx in memory.
 *
 * Only the parts the importer reads are included: the slide XML and, where
 * notes are supplied, the matching notesSlide XML. Real decks carry far more
 * (themes, layouts, rels), none of which the parser touches.
 */
export interface FakeSlide {
  title: string;
  bullets?: string[];
  notes?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textRun(text: string): string {
  return `<a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

function slideXml(slide: FakeSlide): string {
  const paragraphs = [slide.title, ...(slide.bullets ?? [])].map(textRun).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
}

function notesXml(notes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${textRun(notes)}</p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;
}

export async function buildPptx(slides: FakeSlide[]): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );

  slides.forEach((slide, i) => {
    const n = i + 1;
    zip.file(`ppt/slides/slide${n}.xml`, slideXml(slide));
    if (slide.notes) {
      zip.file(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(slide.notes));
    }
  });

  return zip.generateAsync({ type: 'nodebuffer' });
}
