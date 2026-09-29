import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for browser environment
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Extracts line-by-line text tokens from a PDF file buffer.
 * Reconstructs tabular rows by grouping text items sharing the same vertical Y-coordinate.
 */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string[][]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const allRows: string[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by vertical line (tolerance +/- 4px)
    const lineBuckets: { y: number; items: { x: number; text: string }[] }[] = [];

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const rawY = item.transform[5];
      const rawX = item.transform[4];

      // Find an existing bucket within 4px of Y coordinate
      let bucket = lineBuckets.find((b) => Math.abs(b.y - rawY) <= 4);
      if (!bucket) {
        bucket = { y: rawY, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ x: rawX, text: item.str.trim() });
    }

    // Sort lines top to bottom (descending Y)
    lineBuckets.sort((a, b) => b.y - a.y);

    for (const bucket of lineBuckets) {
      // Sort items left to right (ascending X)
      bucket.items.sort((a, b) => a.x - b.x);
      const rowTokens = bucket.items.map((i) => i.text);
      if (rowTokens.length > 0) {
        allRows.push(rowTokens);
      }
    }
  }

  return allRows;
}
