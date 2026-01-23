import { BookParser } from './BookParser';

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

        const title = fileName.replace(/\.txt$/i, '');

        // Split into chunks of ~5000 characters for long files
        const chunkSize = 5000;
        const toc = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            const pageNum = Math.floor(i / chunkSize) + 1;
            toc.push({
                title: `Part ${pageNum}`,
                href: `part-${pageNum}`,
                start: i,
                end: i + chunkSize
            });
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
            if (match) partIndex = parseInt(match[1]) - 1;
        }

        const entry = toc[partIndex];
        const content = text.substring(entry.start, entry.end);

        // Wrap in paragraphs for the reader
        const html = content.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

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
