# WebTTS

A minimalistic, high-fidelity PWA for converting ebooks into immersive audiobooks. WebTTS runs entirely in your browser, offering high-quality text-to-speech with synchronized read-along highlighting and offline support.

## 🚀 Key Features

- **Multi-Format Support**:
  - **EPUB**: Full support for ebooks including visual cover art extraction.
  - **Markdown**: Styled text with automatic chapter detection.
  - **Paste Text**: Instantly convert clipboard content into a readable/speakable book.
- **Smart Reading Time**: Dynamic "min read" estimates that adjust automatically based on your current playback speed.
- **Advanced TTS Engines**:
  - **System TTS**: Utilizes the native Web Speech API (Free, Offline).
  - **Google Cloud TTS**: High-quality neural voices (requires API key).
- **Interactive Player**:
  - **Read-Along Highlighting**: Follow along with sentence-level synchronization.
  - **Sentence Bookmarks**: Long-press/Right-click to bookmark specific sentences.
  - **Media Controls**: Precision control over speed, pitch, and navigation.
- **Persistent Preferences**: Your engine, voice, speed, and pitch settings are saved automatically.
- **PWA & Offline Ready**: Install as a standalone app on Windows or Android. Works completely offline after initial load.
- **Premium Aesthetics**: Clean, responsive design with polished Dark/Light theme transitions.

## 🛠️ Tech Stack

- **Framework**: React + Vite
- **Storage**: IndexedDB (via `localforage`) for books, metadata, and settings.
- **Parsing**: `epub.js` for ebooks, `marked` for Markdown.
- **Icons**: Lucide React
- **PWA**: `vite-plugin-pwa`

## 📖 Getting Started

1. **Import**: Drag and drop an EPUB or MD file, or paste text directly.
2. **Library**: View your books and их estimated reading times.
3. **Player**: Select a voice, adjust your speed, and hit Play.
4. **Bookmark**: Long-press any sentence to save it for later.

## 📄 License

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
Created by **Ayush Maurya**.
