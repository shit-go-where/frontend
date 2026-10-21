import { renderToBuffer } from "@react-pdf/renderer";
import { cacheLife } from "next/cache";
import { createElement } from "react";
import { CvDocument } from "../cv-document";

/** What the Download CV button saves (and the name a browser offers when the PDF is opened directly). */
const FILENAME = "Dylan-Chua-CV.pdf";

/**
 * Rendered once and kept for the life of the deploy: content.ts only changes with a new deploy. Cached
 * as base64 because a cached result must be serialisable; the handler turns it back into bytes.
 */
async function cvPdfBase64(): Promise<string> {
  "use cache";
  cacheLife("max");
  // renderToBuffer's type wants a <Document> element; CvDocument returns one.
  const pdf = await renderToBuffer(createElement(CvDocument) as Parameters<typeof renderToBuffer>[0]);
  return Buffer.from(pdf).toString("base64");
}

export async function GET() {
  const bytes = Buffer.from(await cvPdfBase64(), "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${FILENAME}"`,
    },
  });
}
