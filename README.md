# WebTTS

A minimalistic, client-side PWA for converting EPUB files to audiobooks.

## Features
- **Client-side only**: No server required.
- **Offline Capable**: Works offline via PWA.
- **TTS Engines**: 
  - **Edge TTS**: High quality online voices (via `msedge-tts`).
  - **Piper TTS**: Local neural voices (via WebAssembly).
- **Read-along**: Highlights text as it's spoken.
- **Minimalistic UI**: Focus on the content.
- **Responsive**: Works on Android and Windows.
- **Theme**: Dark/Light mode support.

## Tech Stack
- React + Vite
- epub.js
- msedge-tts
- @mintplex-labs/piper-tts-web
