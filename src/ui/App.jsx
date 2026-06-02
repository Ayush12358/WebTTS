import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './Home';
import { Player } from './Player';
import { TOC } from './TOC';
import { TTSTester } from './TTSTester';
import { ToastProvider } from './components/Toast';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
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
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
