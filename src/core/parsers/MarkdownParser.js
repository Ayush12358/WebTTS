import { BookParser } from './BookParser';
import { marked } from 'marked';

/**
 * Markdown Parser
 * Handles .md and .markdown files
 */
export class MarkdownParser extends BookParser {
    constructor() {
        super();
        this.name = 'MarkdownParser';
        this.supportedExtensions = ['md', 'markdown'];
        this.supportedMimeTypes = ['text/markdown'];
    }

    async parse(data, fileName) {
        let text = "";
        if (data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(data);
        } else {
            text = data.toString();
        }

        // Simple title extraction: first H1 or filename
        const h1Match = text.match(/^#\s+(.+)$/m);
        const title = h1Match ? h1Match[1] : fileName.replace(/\.[^/.]+$/, "");

        // TOC generation based on headers
        const lines = text.split('\n');
        const toc = [];
        let chapterIndex = 0;

        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,3})\s+(.+)$/);
            if (match) {
                // If there's a previous chapter, finalize its word count
                if (toc.length > 0) {
                    const prev = toc[toc.length - 1];
                    const chapterText = lines.slice(prev.lineIndex, index).join(' ');
                    prev.words = chapterText.trim().split(/\s+/).filter(w => w.length > 0).length;
                }
                toc.push({
                    title: match[2],
                    href: `chapter-${chapterIndex++}`,
                    lineIndex: index
                });
            }
        });

        // Finalize the last chapter's word count
        if (toc.length > 0) {
            const last = toc[toc.length - 1];
            const chapterText = lines.slice(last.lineIndex).join(' ');
            last.words = chapterText.trim().split(/\s+/).filter(w => w.length > 0).length;
        }

        // If no headers, create one single chapter
        if (toc.length === 0) {
            const totalWords = text.trim().split(/\s+/).filter(w => w.length > 0).length;
            toc.push({ title: 'Full Text', href: 'chapter-0', lineIndex: 0, words: totalWords });
        }

        return {
            title,
            author: 'Local File',
            cover: null,
            toc,
            spineLength: toc.length,
            instance: { text, toc }
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const { text, toc } = bookInstance;
        let chapterIndex = 0;

        if (typeof chapterRef === 'number') {
            chapterIndex = chapterRef;
        } else if (typeof chapterRef === 'string') {
            const match = chapterRef.match(/chapter-(\d+)/);
            if (match) chapterIndex = parseInt(match[1]);
        }

        const currentEntry = toc[chapterIndex];
        const nextEntry = toc[chapterIndex + 1];

        const lines = text.split('\n');
        const startLine = currentEntry.lineIndex;
        const endLine = nextEntry ? nextEntry.lineIndex : lines.length;

        const chapterText = lines.slice(startLine, endLine).join('\n');
        const html = await marked.parse(chapterText);

        return {
            html,
            title: currentEntry.title
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
