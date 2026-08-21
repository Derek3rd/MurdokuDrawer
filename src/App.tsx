import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import EditorPage from './pages/EditorPage';
import PlayPage from './pages/PlayPage';
import './App.css';

function App() {
  return (
    <HashRouter>
      <header className="mk-header">
        <Link to="/" className="mk-brand">
          🔪 Murdoku
        </Link>
      </header>
      <main className="mk-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/play/:id" element={<PlayPage />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

export default App;
