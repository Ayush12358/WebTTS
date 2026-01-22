import localforage from 'localforage';

const BOOK_KEY = 'current_book';
const INFO_KEY = 'book_info';

export const bookStore = {
    // Save book binary data (ArrayBuffer)
    saveBook: async (data, info) => {
        await localforage.setItem(BOOK_KEY, data);
        if (info) {
            await localforage.setItem(INFO_KEY, info);
        }
    },

    // Load book binary data
    loadBook: async () => {
        return await localforage.getItem(BOOK_KEY);
    },

    // Load book info (metadata)
    loadInfo: async () => {
        return await localforage.getItem(INFO_KEY);
    },

    // Clear storage
    clear: async () => {
        await localforage.removeItem(BOOK_KEY);
        await localforage.removeItem(INFO_KEY);
    }
};
