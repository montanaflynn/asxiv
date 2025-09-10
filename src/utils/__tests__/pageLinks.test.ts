import { processPageReferences, handlePageNavigation } from '../pageLinks';

describe('processPageReferences', () => {
  it('should convert single page references to clickable links', () => {
    const input = 'The Transformer architecture (page 1) revolutionized NLP.';
    const expected = 'The Transformer architecture ([page 1](#page-1)) revolutionized NLP.';
    
    expect(processPageReferences(input)).toBe(expected);
  });

  it('should convert multiple page references to clickable links', () => {
    const input = 'The path length issue (page 2, page 6) is discussed in detail.';
    const expected = 'The path length issue ([page 2](#page-2), [page 6](#page-6)) is discussed in detail.';
    
    expect(processPageReferences(input)).toBe(expected);
  });

  it('should handle three or more page references', () => {
    const input = 'Results are shown (page 3, page 7, page 9) in detail.';
    const expected = 'Results are shown ([page 3](#page-3), [page 7](#page-7), [page 9](#page-9)) in detail.';
    
    expect(processPageReferences(input)).toBe(expected);
  });

  it('should handle multiple separate page reference groups', () => {
    const input = 'First mentioned (page 1) and later discussed (page 3, page 5).';
    const expected = 'First mentioned ([page 1](#page-1)) and later discussed ([page 3](#page-3), [page 5](#page-5)).';
    
    expect(processPageReferences(input)).toBe(expected);
  });

  it('should handle pages with extra whitespace', () => {
    const input = 'The results ( page  2 ,  page  6 ) show improvement.';
    const expected = 'The results ([page 2](#page-2), [page 6](#page-6)) show improvement.';
    
    expect(processPageReferences(input)).toBe(expected);
  });

  it('should NOT convert non-parenthetical page references', () => {
    const input = 'See page 1,3 or page 1-3 or just page 5 for details.';
    // Should remain unchanged
    expect(processPageReferences(input)).toBe(input);
  });

  it('should NOT convert malformed page references', () => {
    const input = 'Invalid formats: (pageX), (page), (page abc), page(1).';
    // Should remain unchanged
    expect(processPageReferences(input)).toBe(input);
  });

  it('should handle empty or undefined input', () => {
    expect(processPageReferences('')).toBe('');
  });

  it('should handle text with no page references', () => {
    const input = 'This text has no page references at all.';
    expect(processPageReferences(input)).toBe(input);
  });
});

describe('handlePageNavigation', () => {
  let mockGetElementById: jest.Mock;
  let consoleSpy: jest.SpyInstance;
  let mockDocument: Document;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockGetElementById = jest.fn();
    
    // Create mock document
    mockDocument = {
      getElementById: mockGetElementById
    } as any;

    // Mock console.error to avoid noise in test output
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should update PDF frame src with page anchor', () => {
    const mockIframe = {
      src: 'https://mozilla.github.io/pdf.js/web/viewer.html?file=https://arxiv.org/pdf/1706.03762'
    };
    mockGetElementById.mockReturnValue(mockIframe);
    
    handlePageNavigation('5', mockDocument);
    
    expect(mockIframe.src).toBe('https://mozilla.github.io/pdf.js/web/viewer.html?file=https://arxiv.org/pdf/1706.03762#page=5');
    expect(mockGetElementById).toHaveBeenCalledWith('pdfFrame');
  });

  it('should handle existing page anchor in URL', () => {
    const mockIframe = {
      src: 'https://mozilla.github.io/pdf.js/web/viewer.html?file=https://arxiv.org/pdf/1706.03762#page=3'
    };
    mockGetElementById.mockReturnValue(mockIframe);
    
    handlePageNavigation('7', mockDocument);
    
    expect(mockIframe.src).toBe('https://mozilla.github.io/pdf.js/web/viewer.html?file=https://arxiv.org/pdf/1706.03762#page=7');
  });

  it('should handle case when PDF frame is not found', () => {
    mockGetElementById.mockReturnValue(null);
    
    // Should not throw error
    expect(() => handlePageNavigation('5', mockDocument)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith('PDF frame not found or has no src');
  });

  it('should handle case when PDF frame has no src', () => {
    const mockIframe = { src: '' };
    mockGetElementById.mockReturnValue(mockIframe);
    
    // Should not throw error
    expect(() => handlePageNavigation('5', mockDocument)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith('PDF frame not found or has no src');
  });
});
