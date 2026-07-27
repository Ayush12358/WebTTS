import { BookParser } from './BookParser';
import { marked } from 'marked';
import { sanitizeHtml } from '../content';

function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

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
        text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

        const h1Match = marked.lexer(text).find(token => token.type === 'heading' && token.depth === 1);
        const title = h1Match ? h1Match.text : fileName.replace(/\.[^/.]+$/, "");
        const tokens = marked.lexer(text);
        const headings = tokens.filter(token => token.type === 'heading' && token.depth <= 3);
        const headingCounts = headings.reduce((counts, heading) => {
            counts[heading.depth] = (counts[heading.depth] || 0) + 1;
            return counts;
        }, {});
        const chapterDepth = [1, 2, 3].find(level => headingCounts[level] > 1) ?? headings[0]?.depth;
        const buildToc = depth => {
            const entries = [];
            let offset = 0;
            tokens.forEach(token => {
                const raw = token.raw || '';
                const startOffset = text.indexOf(raw, offset);
                if (startOffset >= 0) offset = startOffset + raw.length;

                if (token.type === 'heading' && token.depth === depth) {
                    entries.push({
                        id: `chapter-${entries.length}`,
                        title: token.text,
                        href: `chapter-${entries.length}`,
                        level: token.depth,
                        startOffset: Math.max(startOffset, 0),
                        locator: { type: 'text-range', value: Math.max(startOffset, 0) }
                    });
                }
            });
            return entries;
        };

        let toc = buildToc(chapterDepth);
        if (chapterDepth > 1 && headingCounts[1]) {
            const h1Toc = buildToc(1);
            const sparseCount = toc.filter((entry, index) => {
                const endOffset = toc[index + 1]?.startOffset ?? text.length;
                const section = text.slice(entry.startOffset, endOffset)
                    .replace(/^\s*(?:#{1,6}\s+)?[^\n]*(?:\n|$)/, '');
                return countWords(section) < 8;
            }).length;
            // ponytail: repeated lower-level headings with mostly empty sections are subsections, not chapters.
            if (sparseCount >= 2 && sparseCount * 2 >= toc.length && h1Toc.length > 0) toc = h1Toc;
        }
        if (chapterDepth > 1 && toc.length > 1) {
            const compactToc = toc.filter((entry, index) => {
                const endOffset = toc[index + 1]?.startOffset ?? text.length;
                const section = text.slice(entry.startOffset, endOffset)
                    .replace(/^\s*(?:#{1,6}\s+)?[^\n]*(?:\n|$)/, '');
                return countWords(section) >= 8;
            });
            // ponytail: sparse lower-level sections merge into adjacent chapter text instead of becoming empty chapters.
            if (compactToc.length > 0 && compactToc.length < toc.length) toc = compactToc;
        }

        if (toc.length > 0 && toc[0].startOffset > 0) {
            toc[0].startOffset = 0;
            toc[0].locator.value = 0;
        }
        if (toc.length === 0) {
            toc.push({
                id: 'chapter-0',
                title: 'Full Text',
                href: 'chapter-0',
                level: 1,
                startOffset: 0,
                locator: { type: 'text-range', value: 0 },
                words: countWords(text)
            });
        } else {
            toc.forEach((entry, index) => {
                const next = toc[index + 1];
                const endOffset = next ? next.startOffset : text.length;
                entry.endOffset = endOffset;
                entry.words = countWords(text.slice(entry.startOffset, endOffset));
            });
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
            if (match) chapterIndex = parseInt(match[1], 10);
        }

        const currentEntry = toc[chapterIndex];
        if (!currentEntry) throw new Error(`Chapter not found: ${chapterRef}`);
        const endOffset = currentEntry.endOffset ?? text.length;
        const chapterText = text.slice(currentEntry.startOffset, endOffset);
        const html = await marked.parse(chapterText);

        return {
            kind: 'html',
            html: sanitizeHtml(html),
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
