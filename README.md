# WebTTS

A minimalistic, high-fidelity PWA for converting ebooks into immersive audiobooks. WebTTS runs entirely in your browser, offering high-quality text-to-speech with synchronized read-along highlighting and offline support.

## 🚀 Key Features

- **Multi-Format Support**:
  - **EPUB**: Full support for ebooks including visual cover art extraction.
  - **Markdown**: Styled text with automatic chapter detection.
  - **Paste Text**: Instantly convert clipboard content into a readable/speakable book.
  - **PDF**: Native page rendering with local OCR fallback for image-only pages.
- **Smart Reading Time**: Dynamic "min read" estimates that adjust automatically based on your current playback speed.
- **Advanced TTS Engines**:
  - **System TTS**: Utilizes the native Web Speech API (Free, Offline).
  - **Microsoft Edge TTS**: High-quality neural voices via the Edge TTS API (Free, streaming).
- **Interactive Player**:
  - **Read-Along Highlighting**: Follow along with sentence-level synchronization.
  - **Swipe Navigation**: Swipe left/right on mobile to jump between sentences.
  - **Sentence Bookmarks**: Long-press/Right-click to bookmark specific sentences. Manage them in a dedicated slide-out panel with search.
  - **Media Controls**: Precision control over speed, pitch, and navigation.
  - **Bookmark Panel**: Browse, search, and navigate all bookmarks from a slide-out drawer in the reader.
- **Persistent Preferences**: Your engine, voice, speed, and pitch settings are saved automatically.
- **Storage Management**: View storage usage in Settings, with warnings when quota is low. Pre-import checks help avoid failed imports.
- **Loading Skeletons**: Shimmer placeholders during data loading for a polished feel.
- **Toast Notifications**: Non-blocking status updates instead of disruptive alert dialogs.
- **PWA & Offline Ready**: Install as a standalone app on Windows or Android. Works completely offline after initial load.

## 🛠️ Tech Stack

- **Framework**: React 19 + Vite
- **Storage**: IndexedDB (via `localforage`) for books, metadata, bookmarks, and settings.
- **Parsing**: `epub.js` for ebooks, `pdfjs-dist` for PDFs, `marked` for Markdown.
- **TTS**: Edge TTS WebSocket proxy and Web Speech API
- **Icons**: Lucide React
- **PWA**: `vite-plugin-pwa`

## 📖 Getting Started

1. **Import**: Drag and drop an EPUB, PDF, MD, or TXT file, or paste text directly.
2. **Library**: View your books with cover art, reading times, and remaining progress.
3. **Player**: Select a voice, adjust your speed, and hit Play. Swipe to navigate, long-press to bookmark.
4. **Bookmarks**: Open the bookmark panel (📑 icon) to browse, search, and jump to saved passages.
5. **Settings**: Configure TTS engine, voice, speed, pitch, and view storage usage.

## 📄 License

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
Created by **Ayush Maurya**.
