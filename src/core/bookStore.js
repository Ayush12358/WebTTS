import localforage from 'localforage';
import { getParserForFile, getSupportedExtensions } from './parsers';
import { resolveImportFileName } from './importFile';
import { isQuotaError, getStorageEstimate } from './quotaManager';

// Configure instances
const booksStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "books" // Stores binary data
});

const metaStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "metadata" // Stores details: title, author, cover, etc.
});

const bookmarksStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "bookmarks" // Stores line-level bookmarks
});

const settingsStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "settings" // Stores app-wide settings (TTS config, etc.)
});
const ocrStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "ocr" // Stores lazy OCR results by book/page
});

const getOcrKey = (bookId, pageIndex) => `${bookId}:${pageIndex}`;

const removeBookOcr = async (bookId) => {
    const prefix = `${bookId}:`;
    const keys = [];
    await ocrStore.iterate((value, key) => {
        if (String(key).startsWith(prefix)) keys.push(key);
    });
    await Promise.all(keys.map(key => ocrStore.removeItem(key)));
};


export const bookStore = {
    /**
     * Get supported file extensions
     */
    getSupportedExtensions,

    /**
     * Save a new book
     * @param {ArrayBuffer} data 
     * @param {string} fileName 
     * @param {string} mimeType
     */
    addBook: async (data, fileName, mimeType = '') => {
        try {
            const importFileName = resolveImportFileName(fileName, mimeType, data);
            // Get appropriate parser for the file
            const parser = getParserForFile(importFileName, mimeType);
            if (!parser) {
                throw new Error(`Unsupported file format: ${fileName}`);
            }

            // Parse the book to extract metadata
            const parsed = await parser.parse(data, importFileName);

            // Generate ID
            const id = Date.now().toString();

            // Store cover as base64 if available
            let coverData = null;
            if (parsed.cover) {
                try {
                    const reader = new FileReader();
                    coverData = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(parsed.cover);
                    });
                } catch (e) {
                    console.warn("Could not process cover", e);
                }
            }

            const info = {
                id,
                title: parsed.title,
                author: parsed.author,
                fileName: importFileName,
                parserName: parser.name,
                tocVersion: 2,
                totalWords: parsed.toc?.reduce((acc, curr) => acc + (curr.hidden ? 0 : curr.words || 0), 0) || 0,
                spineLength: parsed.spineLength,
                cover: coverData,
                addedAt: Date.now()
            };

            await booksStore.setItem(id, data);
            await metaStore.setItem(id, info);

            return id;
        } catch (e) {
            if (isQuotaError(e)) {
                console.error("Storage quota exceeded", e);
                const err = new Error('Storage is full. Please delete unused books to free up space.');
                err.isQuotaError = true;
                throw err;
            }
            console.error("Failed to add book", e);
            throw e;
        }
    },

    /**
     * Get all books metadata
     */
    getBooks: async () => {
        const books = [];
        await metaStore.iterate((value) => {
            books.push(value);
        });
        return books.sort((a, b) => b.addedAt - a.addedAt);
    },

    /**
     * Get book binary data
     */
    getBookData: async (id) => {
        return await booksStore.getItem(id);
    },

    /**
     * Get book metadata
     */
    getBookMeta: async (id) => {
        return await metaStore.getItem(id);
    },

    /**
     * Update book metadata
     */
    updateBookMeta: async (id, updates) => {
        const meta = await metaStore.getItem(id);
        if (meta) {
            const updated = { ...meta, ...updates };
            // Auto-calculate totalWords if TOC was updated
            if (updates.toc) {
                updated.totalWords = updates.toc.reduce((acc, curr) => acc + (curr.hidden ? 0 : curr.words || 0), 0);
            }
            await metaStore.setItem(id, updated);
        }
    },

    /**
     * Delete book
     */
    removeBook: async (id) => {
        await booksStore.removeItem(id);
        await metaStore.removeItem(id);
        await bookmarksStore.removeItem(id);
        await removeBookOcr(id);
    },

    /**
     * Get parser for a stored book
     * @param {string} fileName 
     */
    getParser: (fileName) => {
        return getParserForFile(fileName);
    },

    /**
     * Get a cached OCR result for one PDF page.
     */
    getPdfOcr: async (bookId, pageIndex) => {
        return await ocrStore.getItem(getOcrKey(bookId, pageIndex));
    },

    /**
     * Save a lazy OCR result for one PDF page.
     */
    savePdfOcr: async (bookId, pageIndex, result) => {
        await ocrStore.setItem(getOcrKey(bookId, pageIndex), {
            version: 1,
            pageIndex,
            text: result.text,
            words: result.words,
            confidence: result.confidence ?? null,
            savedAt: Date.now()
        });
    },

    /**
     * Add a bookmark to a stable chapter/segment locator.
     */
    addBookmark: async (bookId, spineIndex, nodeIndex, text, chapterId = null) => {
        const bookmarks = await bookmarksStore.getItem(bookId) || [];
        const newBookmark = {
            id: Date.now().toString(),
            spineIndex,
            nodeIndex,
            chapterId,
            segmentId: String(nodeIndex),
            text: text.length > 100 ? text.substring(0, 100) + "..." : text,
            timestamp: Date.now()
        };
        bookmarks.push(newBookmark);
        await bookmarksStore.setItem(bookId, bookmarks);
        return newBookmark;
    },

    /**
     * Get all bookmarks for a book
     */
    getBookmarks: async (bookId) => {
        return await bookmarksStore.getItem(bookId) || [];
    },

    /**
     * Remove a specific bookmark
     */
    removeBookmark: async (bookId, bookmarkId) => {
        const bookmarks = await bookmarksStore.getItem(bookId) || [];
        const filtered = bookmarks.filter(b => b.id !== bookmarkId);
        await bookmarksStore.setItem(bookId, filtered);
    },

    /**
     * Get app-wide settings
     */
    getSettings: async (key) => {
        return await settingsStore.getItem(key);
    },

    /**
     * Save app-wide setting
     */
    saveSettings: async (key, value) => {
        await settingsStore.setItem(key, value);
    },

    /**
     * Save reading progress.
     */
    saveProgress: async (bookId, spineIndex, nodeIndex, chapterId = null) => {
        const meta = await metaStore.getItem(bookId);
        if (meta) {
            await metaStore.setItem(bookId, {
                ...meta,
                lastProgress: { spineIndex, nodeIndex, chapterId, segmentId: String(nodeIndex) }
            });
        }
    },

    /**
     * Get reading progress
     */
    getProgress: async (bookId) => {
        const meta = await metaStore.getItem(bookId);
        return meta?.lastProgress || null;
    },

    /**
     * Get current storage usage estimate
     */
    getStorageUsage: async () => {
        return await getStorageEstimate();
    },

    /**
     * Clear all books, metadata, and bookmarks from storage
     */
    clearAllBooks: async () => {
        await booksStore.clear();
        await metaStore.clear();
        await bookmarksStore.clear();
        await ocrStore.clear();
    }
};
