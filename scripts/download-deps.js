import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const files = [
    {
        url: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
        dest: path.join(publicDir, 'piper_phonemize.wasm')
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
        dest: path.join(publicDir, 'piper_phonemize.data')
    }
];

const download = async (url, dest) => {
    console.log(`Downloading ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    console.log(`Saved to ${dest} (${buffer.byteLength} bytes)`);
};

const run = async () => {
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    for (const f of files) {
        try {
            await download(f.url, f.dest);
        } catch (e) {
            console.error(e);
        }
    }
};

run();
