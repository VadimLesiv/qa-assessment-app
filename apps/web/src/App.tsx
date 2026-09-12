import { Route, Routes } from 'react-router-dom';
import { Hud } from './components/Hud';
import { DashboardPage } from './pages/DashboardPage';
import { SectionPage } from './pages/SectionPage';
import { StudyPage } from './pages/StudyPage';
import { QuizPage } from './pages/QuizPage';
import { ManagePage } from './pages/ManagePage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <div className="app-shell">
      <Hud />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sections/:sectionId" element={<SectionPage />} />
        <Route path="/decks/:subSectionId" element={<StudyPage />} />
        <Route path="/decks/:subSectionId/quiz" element={<QuizPage />} />
        <Route path="/manage" element={<ManagePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
