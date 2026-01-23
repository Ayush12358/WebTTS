import localforage from 'localforage';
import { getParserForFile, getSupportedExtensions } from './parsers';

// Configure instances
const booksStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "books" // Stores binary data
});

const metaStore = localforage.createInstance({
    name: "WebTTS",
    storeName: "metadata" // Stores details: title, author, cover, etc.
});

export const bookStore = {
    /**
     * Get supported file extensions
     */
    getSupportedExtensions,

    /**
     * Save a new book
     * @param {ArrayBuffer} data 
     * @param {string} fileName 
     */
    addBook: async (data, fileName) => {
        try {
            // Get appropriate parser for the file
            const parser = getParserForFile(fileName);
            if (!parser) {
                throw new Error(`Unsupported file format: ${fileName}`);
            }

            // Parse the book to extract metadata
            const parsed = await parser.parse(data, fileName);

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
                fileName,
                parserName: parser.name,
                toc: parsed.toc,
                spineLength: parsed.spineLength,
                cover: coverData,
                addedAt: Date.now()
            };

            await booksStore.setItem(id, data);
            await metaStore.setItem(id, info);

            return id;
        } catch (e) {
            console.error("Failed to add book", e);
            throw e;
        }
    },

    /**
     * Get all books metadata
     */
    getBooks: async () => {
        const books = [];
        await metaStore.iterate((value, key) => {
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
     * Delete book
     */
    removeBook: async (id) => {
        await booksStore.removeItem(id);
        await metaStore.removeItem(id);
    },

    /**
     * Get parser for a stored book
     * @param {string} fileName 
     */
    getParser: (fileName) => {
        return getParserForFile(fileName);
    }
};
