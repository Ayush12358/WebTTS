import { BookParser } from './BookParser';
import * as pdfjsLib from 'pdfjs-dist';

// Using unpkg for the worker since cdnjs 5.4.624 threw a 404
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * PDF Parser
 * Handles .pdf files using pdfjs-dist
 */
export class PDFParser extends BookParser {
    constructor() {
        super();
        this.name = 'PDFParser';
        this.supportedExtensions = ['pdf'];
        this.supportedMimeTypes = ['application/pdf'];
    }

    async parse(data, fileName) {
        let pdfData;
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            pdfData = new Uint8Array(data);
        } else {
            throw new Error('PDFParser requires an ArrayBuffer or Uint8Array');
        }

        const title = fileName.replace(/\.pdf$/i, '');

        let pdf;
        try {
            // pdfjsLib.getDocument can take a Uint8Array directly
            // Use slice() so pdf.js doesn't detach/transfer the underlying ArrayBuffer, which would prevent us from saving it to IndexedDB later!
            pdf = await pdfjsLib.getDocument(pdfData.slice()).promise;
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw new Error('Failed to load PDF document. It might be encrypted or corrupted.');
        }

        const numPages = pdf.numPages;
        const pagesText = [];
        const toc = [];

        // We'll extract text from each page.
        // For very large PDFs, this could be slow, but for TTS we generally need the full text.
        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // Heuristic: concatenate text items. pdfjs returns individual text chunks.
                // We add a space between chunks if they are on the same line, or a newline if Y coordinate changes significantly.
                let pageText = '';
                let lastY = -1;

                for (const item of textContent.items) {
                    if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                        pageText += '\n'; // New line roughly
                    } else if (lastY !== -1) {
                        pageText += ' ';
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }

                // Clean up excessive whitespace
                pageText = pageText.replace(/\s+/g, ' ').trim();

                pagesText.push(pageText);

                const wordCount = pageText.split(/\s+/).filter(w => w.length > 0).length;

                toc.push({
                    title: `Page ${i}`,
                    href: `page-${i}`,
                    start: i - 1, // Store index to pagesText array
                    end: i - 1,
                    words: wordCount
                });
            } catch (err) {
                console.warn(`Could not extract text from page ${i}:`, err);
                pagesText.push(''); // Push empty string so indices line up
                toc.push({
                    title: `Page ${i} (Unreadable)`,
                    href: `page-${i}`,
                    start: i - 1,
                    end: i - 1,
                    words: 0
                });
            }
        }

        return {
            title,
            author: 'PDF Document',
            cover: null, // Could potentially render first page to canvas, but keeping it simple for now
            toc,
            spineLength: toc.length,
            instance: { pagesText, toc }
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const { pagesText, toc } = bookInstance;
        let pageIndex = 0;

        if (typeof chapterRef === 'number') {
            pageIndex = chapterRef;
        } else if (typeof chapterRef === 'string') {
            const match = chapterRef.match(/page-(\d+)/);
            if (match) pageIndex = parseInt(match[1]) - 1;
        }

        const entry = toc[pageIndex];
        const content = pagesText[pageIndex] || '';

        // Wrap in paragraphs roughly based on standard sentencizer or newlines if any remained
        // We stripped newlines earlier, so we just wrap the whole block in a <p> or split by period.
        // Actually, WebTTS handles plain <p> tags well.

        let html;
        if (content.length > 0) {
            // Basic splitting at punctuation followed by space to create readable paragraphs
            const paragraphs = content.split(/(?<=[.!?])\s+/);
            html = paragraphs.map(p => `<p>${p}</p>`).join('');
        } else {
            html = '<p><i>[Blank Page or Unreadable Content]</i></p>';
        }

        return {
            html,
            title: entry.title
        };
    }

    getNextChapter(bookInstance, currentIndex) {
        if (currentIndex < bookInstance.toc.length - 1) {
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
