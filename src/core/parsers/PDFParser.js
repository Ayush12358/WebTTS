import { BookParser } from './BookParser';
import { pdfjsLib } from '../pdfjs';
import { splitTextIntoSegments } from '../content';

function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function extractPageText(items) {
    const lines = [];
    for (const item of items || []) {
        const text = item.str?.trim();
        if (!text) continue;

        const y = item.transform?.[5] ?? 0;
        const currentLine = lines[lines.length - 1];
        if (!currentLine || item.hasEOL || Math.abs(y - currentLine.y) > 5) {
            lines.push({ y, items: [{ x: item.transform?.[4] ?? 0, text }] });
        } else {
            currentLine.items.push({ x: item.transform?.[4] ?? 0, text });
        }
    }

    return lines
        .map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
        .join('\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

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

        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = extractPageText(textContent.items);

                pagesText.push(pageText);
                toc.push({
                    id: `page-${i}`,
                    title: `Page ${i}`,
                    href: `page-${i}`,
                    start: i - 1,
                    end: i - 1,
                    words: countWords(pageText),
                    locator: { type: 'pdf-page', value: i - 1 }
                });
            } catch (err) {
                console.warn(`Could not extract text from page ${i}:`, err);
                pagesText.push('');
                toc.push({
                    id: `page-${i}`,
                    title: `Page ${i} (Unreadable)`,
                    href: `page-${i}`,
                    start: i - 1,
                    end: i - 1,
                    words: 0,
                    locator: { type: 'pdf-page', value: i - 1 }
                });
            }
        }

        return {
            title,
            author: 'PDF Document',
            cover: null,
            toc,
            spineLength: toc.length,
            instance: { data: pdfData, pagesText, toc }
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const { data, pagesText, toc } = bookInstance;
        let pageIndex = 0;

        if (typeof chapterRef === 'number') {
            pageIndex = chapterRef;
        } else if (typeof chapterRef === 'string') {
            const match = chapterRef.match(/page-(\d+)/);
            if (match) pageIndex = parseInt(match[1], 10) - 1;
        }

        const entry = toc[pageIndex];
        if (!entry) throw new Error(`Page not found: ${chapterRef}`);

        const text = pagesText[pageIndex] || '';
        return {
            kind: 'pdf-page',
            title: entry.title,
            pdfData: data,
            pageIndex: pageIndex + 1,
            segments: splitTextIntoSegments(text),
            empty: !text
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
