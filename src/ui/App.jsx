import React from 'react';
import { ThemeToggle } from './components/ThemeToggle';

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './Home';
import { Player } from './Player';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0 }}>WebTTS</h1>
          <ThemeToggle />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/player" element={<Player />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
