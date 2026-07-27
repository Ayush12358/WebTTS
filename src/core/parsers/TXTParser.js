import { BookParser } from './BookParser';
import { sanitizeHtml, textToHtml } from '../content';

function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Plain Text Parser
 * Handles .txt files
 */
export class TXTParser extends BookParser {
    constructor() {
        super();
        this.name = 'TXTParser';
        this.supportedExtensions = ['txt'];
        this.supportedMimeTypes = ['text/plain'];
    }

    async parse(data, fileName) {
        let text = "";
        if (data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(data);
        } else {
            text = data.toString();
        }
        text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

        const title = fileName.replace(/\.txt$/i, '');
        const toc = [];
        const chunkSize = 5000;

        if (!text) {
            toc.push({
                id: 'part-1',
                title: 'Full Text',
                href: 'part-1',
                start: 0,
                end: 0,
                locator: { type: 'text-range', value: 0 },
                words: 0
            });
        } else {
            let start = 0;
            while (start < text.length) {
                let end = Math.min(start + chunkSize, text.length);
                if (end < text.length) {
                    const paragraphEnd = text.lastIndexOf('\n\n', end);
                    const wordEnd = text.lastIndexOf(' ', end);
                    if (paragraphEnd > start + 500) {
                        end = paragraphEnd + 2;
                    } else if (wordEnd > start) {
                        end = wordEnd;
                    }
                }

                const content = text.slice(start, end);
                const pageNum = toc.length + 1;
                toc.push({
                    id: `part-${pageNum}`,
                    title: `Part ${pageNum}`,
                    href: `part-${pageNum}`,
                    start,
                    end,
                    locator: { type: 'text-range', value: start },
                    words: countWords(content)
                });
                start = end;
            }
        }

        return {
            title,
            author: 'Local text',
            cover: null,
            toc,
            spineLength: toc.length,
            instance: { text, toc }
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const { text, toc } = bookInstance;
        let partIndex = 0;

        if (typeof chapterRef === 'number') {
            partIndex = chapterRef;
        } else if (typeof chapterRef === 'string') {
            const match = chapterRef.match(/part-(\d+)/);
            if (match) partIndex = parseInt(match[1], 10) - 1;
        }

        const entry = toc[partIndex];
        if (!entry) throw new Error(`Part not found: ${chapterRef}`);
        const content = text.substring(entry.start, entry.end);

        return {
            kind: 'html',
            html: sanitizeHtml(textToHtml(content)),
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
