import { BookParser } from './BookParser';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

/**
 * PDF Parser using pdf.js (v5+)
 * Handles .pdf files
 */
export class PDFParser extends BookParser {
    constructor() {
        super();
        this.name = 'PDFParser';
        this.supportedExtensions = ['pdf'];
        this.supportedMimeTypes = ['application/pdf'];

        // Initialize worker
        if (typeof window !== 'undefined') {
            // Using a more robust way for Vite to resolve the worker
            try {
                // In Vite, this ?url import is the most reliable way to get a URL to a node_module asset
                // that avoids bundling it into the main JS chunk.
                const workerUrl = new URL(
                    '../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
                    import.meta.url
                ).href;
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            } catch (e) {
                // Fallback to CDN if local resolution fails
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
            }
        }
    }

    async parse(data, fileName) {
        try {
            console.log('PDFParser: Starting parse for', fileName);

            // pdf.js getDocument needs a typed array or URL, not a raw ArrayBuffer
            const uint8Data = new Uint8Array(data);

            const loadingTask = pdfjsLib.getDocument({
                data: uint8Data,
                // These options can help with loading issues
                disableFontFace: false,
                isEvalSupported: false,
            });

            const pdf = await loadingTask.promise;
            console.log('PDFParser: Document loaded successfully. Pages:', pdf.numPages);

            let title = fileName.replace(/\.pdf$/i, '');
            let author = 'Unknown Author';

            try {
                const metadata = await pdf.getMetadata();
                if (metadata && metadata.info) {
                    title = metadata.info.Title || title;
                    author = metadata.info.Author || author;
                }
            } catch (e) {
                console.warn('PDFParser: Metadata extraction failed', e);
            }

            // Extract TOC (outlines)
            let toc = [];
            try {
                const outline = await pdf.getOutline();
                if (outline && outline.length > 0) {
                    toc = outline.map((item, idx) => ({
                        title: item.title,
                        dest: item.dest,
                        href: `dest-${idx}`
                    }));
                }
            } catch (e) {
                console.warn('PDFParser: TOC extraction failed', e);
            }

            // Fallback to page-based TOC
            if (toc.length === 0) {
                for (let i = 1; i <= pdf.numPages; i++) {
                    toc.push({
                        title: `Page ${i}`,
                        href: `page-${i}`,
                        pageNumber: i
                    });
                }
            }

            return {
                title,
                author,
                cover: null,
                toc,
                spineLength: pdf.numPages,
                instance: pdf
            };
        } catch (err) {
            console.error('PDFParser: Fatal parse error', err);
            throw new Error(`PDF Parsing failed: ${err.message}. Please check if the file is a valid PDF.`);
        }
    }

    async getChapterContent(bookInstance, chapterRef) {
        try {
            const pdf = bookInstance;
            let pageNumber = 1;

            if (typeof chapterRef === 'number') {
                pageNumber = chapterRef + 1;
            } else if (typeof chapterRef === 'string') {
                const match = chapterRef.match(/page-(\d+)/);
                if (match) {
                    pageNumber = parseInt(match[1]);
                }
            }

            if (pageNumber < 1 || pageNumber > pdf.numPages) {
                throw new Error(`Page ${pageNumber} is out of bounds (1-${pdf.numPages})`);
            }

            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();

            let lastY = -1;
            let html = '<div class="pdf-page-content" style="white-space: pre-wrap; font-family: sans-serif;">';

            for (const item of textContent.items) {
                const y = item.transform[5];

                // Group into paragraphs/lines based on Y coordinate
                if (lastY !== -1 && Math.abs(y - lastY) > 10) {
                    html += '<br/>';
                }

                // Wrap strings in spans to allow granular TTS selection if needed
                html += `<span>${item.str}</span> `;
                lastY = y;
            }

            html += '</div>';

            return {
                html,
                title: `Page ${pageNumber}`
            };
        } catch (err) {
            console.error('PDFParser: Page extraction failed', err);
            throw new Error(`Failed to load page content: ${err.message}`);
        }
    }

    getNextChapter(bookInstance, currentIndex) {
        if (currentIndex < bookInstance.numPages - 1) {
            return currentIndex + 1;
        }
        return null;
    }

    getPrevChapter(bookInstance, currentIndex) {
        if (currentIndex > 0) {
            return currentIndex - 1;
        }
        return null;
    }
}
