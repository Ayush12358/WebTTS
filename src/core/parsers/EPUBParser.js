import { BookParser } from './BookParser';
import ePub from 'epubjs';

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

        // Extract cover
        let cover = null;
        try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
                // Convert blob URL to actual blob for storage
                const response = await fetch(coverUrl);
                cover = await response.blob();
            }
        } catch (e) {
            console.warn("Could not extract EPUB cover", e);
        }

        // Extract TOC and word counts
        const toc = [];
        for (let i = 0; i < book.spine.length; i++) {
            const item = book.spine.get(i);
            if (!item) continue;

            const navItem = navigation.toc.find(n => n.href.includes(item.href) || item.href.includes(n.href));

            try {
                const doc = await item.load(book.load.bind(book));
                let text = "";
                if (doc) {
                    if (doc.body) text = doc.body.textContent || doc.body.innerText || "";
                    else if (doc.textContent) text = doc.textContent;
                    else if (typeof doc === 'string') text = doc;
                }
                const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;

                toc.push({
                    title: navItem ? navItem.label : `Chapter ${i + 1}`,
                    href: item.href,
                    words: words,
                    spineIndex: i
                });
            } catch (e) {
                console.warn(`Failed to count words for chapter ${i}`, e);
                toc.push({
                    title: navItem ? navItem.label : `Chapter ${i + 1}`,
                    href: item.href,
                    words: 0,
                    spineIndex: i
                });
            }
        }

        return {
            title: metadata.title || 'Unknown Title',
            author: metadata.creator || 'Unknown Author',
            cover,
            toc,
            spineLength: book.spine.length,
            instance: book // Return the epub.js book instance
        };
    }

    async getChapterContent(bookInstance, chapterRef) {
        const book = bookInstance;

        // chapterRef can be index (number) or href (string)
        let spineItem;
        if (typeof chapterRef === 'number') {
            spineItem = book.spine.get(chapterRef);
        } else {
            spineItem = book.spine.get(chapterRef);
        }

        if (!spineItem) {
            throw new Error(`Chapter not found: ${chapterRef}`);
        }

        // Load the chapter document
        const doc = await spineItem.load(book.load.bind(book));

        // Process images - replace src with blob URLs
        const images = doc.querySelectorAll('img');
        const imagePromises = Array.from(images).map(async (img) => {
            const src = img.getAttribute('src');
            if (src) {
                try {
                    const absolutePath = book.path.resolve(src, spineItem.url);
                    const url = await book.archive.createUrl(absolutePath);
                    img.src = url;
                } catch (e) {
                    console.warn('Failed to load image:', src, e);
                }
            }
        });
        await Promise.all(imagePromises);

        // Get body content
        const bodyEl = doc.body || doc.querySelector('body');
        const html = bodyEl ? bodyEl.innerHTML : '';
        const textContent = bodyEl ? (bodyEl.textContent || bodyEl.innerText || '') : '';
        const words = textContent.trim().split(/\s+/).filter(w => w.length > 0).length;

        return {
            html,
            words,
            title: spineItem.idref || `Chapter ${chapterRef}`
        };
    }

    getNextChapter(bookInstance, currentIndex) {
        if (currentIndex < bookInstance.spine.length - 1) {
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
