/**
 * Processes text content to convert page references into markdown links
 * Supports formats: (page N) and (page N, page M)
 * @param content - The text content to process
 * @returns The processed content with page references converted to markdown links
 */
export function processPageReferences(content: string): string {
  return content.replace(/\(\s*page\s+(\d+(?:\s*,\s*page\s+\d+)*)\s*\)/g, (match, pageList: string) => {
    const pages = pageList.split(/\s*,\s*page\s+/);
    const links = pages.map((pageNum: string) => `[page ${pageNum.trim()}](#page-${pageNum.trim()})`);
    return `(${links.join(', ')})`;
  });
}

/**
 * Handles clicking on a page reference link by navigating the PDF viewer
 * @param pageNum - The page number to navigate to
 * @param doc - Optional document object for testing
 */
export function handlePageNavigation(pageNum: string, doc?: Document): void {
  if (typeof window === 'undefined' && !doc) return;
  
  const documentObj = doc || document;
  const pdfFrame = documentObj.getElementById('pdfFrame') as HTMLIFrameElement;
  if (pdfFrame && pdfFrame.src) {
    const baseUrl = pdfFrame.src.split('#')[0];
    const newUrl = `${baseUrl}#page=${pageNum}`;
    pdfFrame.src = newUrl;
  } else {
    console.error('PDF frame not found or has no src');
  }
}
