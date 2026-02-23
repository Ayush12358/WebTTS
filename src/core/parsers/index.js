import { EPUBParser } from './EPUBParser';
import { MarkdownParser } from './MarkdownParser';
import { TXTParser } from './TXTParser';
import { PDFParser } from './PDFParser';

// Registry of all available parsers
const parsers = [
    new EPUBParser(),
    new MarkdownParser(),
    new TXTParser(),
    new PDFParser()
];

/**
 * Get the appropriate parser for a file
 * @param {string} fileName 
 * @param {string} mimeType 
 * @returns {BookParser|null}
 */
export function getParserForFile(fileName, mimeType = '') {
    for (const parser of parsers) {
        if (parser.canParse(fileName, mimeType)) {
            return parser;
        }
    }
    return null;
}

/**
 * Get list of all supported file extensions
 * @returns {string[]}
 */
export function getSupportedExtensions() {
    const extensions = [];
    for (const parser of parsers) {
        extensions.push(...parser.supportedExtensions);
    }
    return [...new Set(extensions)];
}

/**
 * Register a new parser
 * @param {BookParser} parser 
 */
export function registerParser(parser) {
    parsers.push(parser);
}

export { EPUBParser, MarkdownParser, TXTParser, PDFParser };
