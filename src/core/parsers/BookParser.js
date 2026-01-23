/**
 * Base class for Book Parsers
 * Extend this class to add support for new book formats (EPUB, MOBI, TXT, etc.)
 */
export class BookParser {
    constructor() {
        this.name = 'BaseParser';
        this.supportedExtensions = [];
        this.supportedMimeTypes = [];
    }

    /**
     * Check if this parser can handle the given file
     * @param {string} fileName 
     * @param {string} mimeType 
     * @returns {boolean}
     */
    canParse(fileName, mimeType) {
        const ext = fileName.split('.').pop().toLowerCase();
        return this.supportedExtensions.includes(ext) ||
            this.supportedMimeTypes.includes(mimeType);
    }

    /**
     * Parse the book data and extract metadata
     * @param {ArrayBuffer} data - Raw book file data
     * @param {string} fileName - Original filename
     * @returns {Promise<{
     *   title: string,
     *   author: string,
     *   cover: Blob|null,
     *   toc: Array<{title: string, href: string}>,
     *   instance: any  // Parser-specific book instance for rendering
     * }>}
     */
    async parse(data, fileName) {
        throw new Error("Method 'parse' must be implemented by subclass");
    }

    /**
     * Get chapter content for reading
     * @param {any} bookInstance - The book instance returned from parse()
     * @param {number|string} chapterRef - Chapter index or href
     * @returns {Promise<{
     *   html: string,
     *   title: string
     * }>}
     */
    async getChapterContent(bookInstance, chapterRef) {
        throw new Error("Method 'getChapterContent' must be implemented by subclass");
    }

    /**
     * Navigate to next chapter
     * @param {any} bookInstance 
     * @param {number} currentIndex 
     * @returns {number|null} Next chapter index or null if at end
     */
    getNextChapter(bookInstance, currentIndex) {
        throw new Error("Method 'getNextChapter' must be implemented by subclass");
    }

    /**
     * Navigate to previous chapter
     * @param {any} bookInstance 
     * @param {number} currentIndex 
     * @returns {number|null} Previous chapter index or null if at start
     */
    getPrevChapter(bookInstance, currentIndex) {
        throw new Error("Method 'getPrevChapter' must be implemented by subclass");
    }
}
