import localforage from 'localforage';
import ePub from 'epubjs';

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
     * Save a new book
     * @param {ArrayBuffer} data 
     * @param {string} fileName 
     */
    addBook: async (data, fileName) => {
        try {
            // We need to parse it to get metadata and a unique ID
            const book = ePub(data);
            const metadata = await book.loaded.metadata;

            // Generate a simple ID or use title+author?
            // Using timestamp + valid filename chars for simple ID
            const id = Date.now().toString();

            // Extract cover
            let coverUrl = null;
            try {
                const coverUrlRaw = await book.coverUrl();
                if (coverUrlRaw) {
                    // Fetch and store as blob? or just dataURL
                    // Start with dataURL if small, but blob is better. 
                    // epub.js coverUrl() likely gives a blob url. We need to convert to base64 or Blob for storage?
                    // Actually, let's just store the text meta first.
                }
            } catch (e) {
                console.warn("Could not extract cover", e);
            }

            const info = {
                id,
                title: metadata.title,
                author: metadata.creator,
                fileName,
                addedAt: Date.now(),
                // positions/locations can be cached later
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

    // Legacy support for the refactor transition (can be removed if I update all calls immediately)
    saveBook: async () => { console.warn("saveBook is deprecated, use addBook"); },
    loadBook: async () => { console.warn("loadBook is deprecated, use getBookData"); },
};
