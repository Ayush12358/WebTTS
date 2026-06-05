const MIME_TYPE_EXTENSIONS = new Map([
    ['application/pdf', 'pdf'],
    ['application/epub+zip', 'epub'],
    ['text/plain', 'txt'],
    ['text/markdown', 'md'],
    ['text/x-markdown', 'md']
]);

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });

function getExtension(fileName) {
    const match = fileName?.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

function appendExtension(fileName, extension) {
    const baseName = fileName?.trim() || 'Imported Book';
    return getExtension(baseName) ? baseName : `${baseName}.${extension}`;
}

function sniffBufferExtension(data) {
    const bytes = new Uint8Array(data.slice(0, 1024));
    if (bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46) {
        return 'pdf';
    }

    if (bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04 &&
        decodedBytes(bytes).includes('application/epub+zip')) {
        return 'epub';
    }

    const decoded = decodedBytes(bytes);
    const replacementCount = Array.from(decoded).filter(char => char === '\uFFFD').length;
    const controlCount = Array.from(decoded).filter(char => {
        const code = char.charCodeAt(0);
        return code < 32 && ![9, 10, 13].includes(code);
    }).length;

    if (decoded.length > 0 && replacementCount === 0 && controlCount / decoded.length < 0.05) {
        return 'txt';
    }

    return '';
}

function decodedBytes(bytes) {
    return TEXT_DECODER.decode(bytes);
}

export function resolveImportFileName(fileName, mimeType = '', data = null) {
    if (getExtension(fileName)) return fileName;

    const normalizedMimeType = mimeType.toLowerCase();
    const mimeExtension = MIME_TYPE_EXTENSIONS.get(normalizedMimeType);
    if (mimeExtension) return appendExtension(fileName, mimeExtension);
    if (normalizedMimeType.startsWith('text/')) return appendExtension(fileName, 'txt');

    if (data instanceof ArrayBuffer) {
        const sniffedExtension = sniffBufferExtension(data);
        if (sniffedExtension) return appendExtension(fileName, sniffedExtension);
    }

    return fileName;
}
