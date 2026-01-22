import React from 'react';
import { ThemeToggle } from './components/ThemeToggle';

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './Home';
import { Player } from './Player';
import { TOC } from './TOC';
import { TTSTester } from './TTSTester';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/book/:id/toc" element={<TOC />} />
            <Route path="/book/:id/read/:cfi" element={<Player />} />
            <Route path="/test-tts" element={<TTSTester />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
