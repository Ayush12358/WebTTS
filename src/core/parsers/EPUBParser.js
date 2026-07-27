import { BookParser } from './BookParser';
import ePub from 'epubjs';
import { sanitizeHtml } from '../content';

function flattenNavigation(items, result = []) {
    for (const item of items || []) {
        result.push(item);
        flattenNavigation(item.subitems, result);
    }
    return result;
}

function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * EPUB Parser using epub.js
 * Handles .epub files
 */
export class EPUBParser extends BookParser {
    constructor() {
        super();
        this.name = 'EPUBParser';
        this.supportedExtensions = ['epub'];
        this.supportedMimeTypes = ['application/epub+zip'];
    }

    async parse(data, fileName) {
        const book = ePub(data);
        await book.ready;

        const metadata = await book.loaded.metadata;
        const navigation = await book.loaded.navigation;
        const navigationItems = flattenNavigation(navigation.toc);

        let cover = null;
        try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
                const response = await fetch(coverUrl);
                cover = await response.blob();
            }
        } catch (e) {
            console.warn("Could not extract EPUB cover", e);
        }

        const toc = [];
        for (let i = 0; i < book.spine.length; i++) {
            const item = book.spine.get(i);
            if (!item) continue;

            const navItem = navigationItems.find(n =>
                n.href?.includes(item.href) || item.href?.includes(n.href)
            );

            try {
                const doc = await item.load(book.load.bind(book));
                const text = doc?.body?.textContent || doc?.textContent || '';
                const words = countWords(text);
                // ponytail: short structural EPUB pages are hidden; explicit chapters with body text remain visible.
                const headingOnly = Boolean(doc?.body?.querySelector('h1,h2,h3,h4,h5,h6')) &&
                    !Array.from(doc.body.querySelectorAll('*')).some(element =>
                        !/^H[1-6]$/.test(element.tagName) &&
                        element.children.length === 0 &&
                        element.textContent.trim()
                    );
                const hidden = item.linear === 'no' || (!navItem && words < 20) || (headingOnly && words < 20);
                toc.push({
                    id: `spine-${i}`,
                    title: navItem?.label || `Chapter ${i + 1}`,
                    href: item.href,
                    words,
                    spineIndex: i,
                    hidden,
                    locator: { type: 'spine', value: i }
                });
            } catch (e) {
                console.warn(`Failed to count words for chapter ${i}`, e);
                const hidden = item.linear === 'no' || !navItem;
                toc.push({
                    id: `spine-${i}`,
                    title: navItem?.label || `Chapter ${i + 1}`,
                    href: item.href,
                    words: 0,
                    spineIndex: i,
                    hidden,
                    locator: { type: 'spine', value: i }
                });
            }
        }

        book.__webTtsHiddenSpineIndices = toc.filter(chapter => chapter.hidden).map(chapter => chapter.spineIndex);
        return {
            title: metadata.title || fileName.replace(/\.[^/.]+$/, '') || 'Unknown Title',
            author: metadata.creator || 'Unknown Author',
            cover,
            toc,
            spineLength: book.spine.length,
            instance: book
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const book = bookInstance;
        const spineItem = typeof chapterRef === 'number'
            ? book.spine.get(chapterRef)
            : book.spine.get(chapterRef);

        if (!spineItem) {
            throw new Error(`Chapter not found: ${chapterRef}`);
        }

        const doc = await spineItem.load(book.load.bind(book));
        const images = doc?.querySelectorAll('img') || [];
        await Promise.all(Array.from(images).map(async img => {
            const src = img.getAttribute('src');
            if (!src) return;
            if (/^(?:https?:|javascript:)/i.test(src)) {
                img.removeAttribute('src');
                return;
            }

            try {
                const absolutePath = book.path.resolve(src, spineItem.url);
                img.src = await book.archive.createUrl(absolutePath);
            } catch (e) {
                console.warn('Failed to load image:', src, e);
                img.removeAttribute('src');
            }
        }));

        const bodyEl = doc?.body || doc?.querySelector('body');
        const html = bodyEl?.innerHTML || '';
        const textContent = bodyEl?.textContent || '';

        return {
            kind: 'html',
            html: sanitizeHtml(html),
            words: countWords(textContent),
            title: spineItem.idref || `Chapter ${chapterRef}`
        };
    }

    getNextChapter(bookInstance, currentIndex) {
        const hidden = bookInstance.__webTtsHiddenSpineIndices || [];
        for (let index = currentIndex + 1; index < bookInstance.spine.length; index++) {
            if (!hidden.includes(index)) return index;
        }
        return null;
    }

    getPrevChapter(bookInstance, currentIndex) {
        const hidden = bookInstance.__webTtsHiddenSpineIndices || [];
        for (let index = currentIndex - 1; index >= 0; index--) {
            if (!hidden.includes(index)) return index;
        }
        return null;
    }
}
