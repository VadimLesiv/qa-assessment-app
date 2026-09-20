import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Hud } from './components/Hud';
import { DashboardPage } from './pages/DashboardPage';
import { SectionPage } from './pages/SectionPage';
import { StudyPage } from './pages/StudyPage';
import { QuizPage } from './pages/QuizPage';
import { ManagePage } from './pages/ManagePage';
import { ProfilePage } from './pages/ProfilePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { usePlayer } from './lib/PlayerContext';
import { Loading } from './components/States';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = usePlayer();
  if (loading) return <Loading label="Loading…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <div className="app-shell">
      <Hud />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/sections/:sectionId" element={<RequireAuth><SectionPage /></RequireAuth>} />
        <Route path="/decks/:subSectionId" element={<RequireAuth><StudyPage /></RequireAuth>} />
        <Route path="/decks/:subSectionId/quiz" element={<RequireAuth><QuizPage /></RequireAuth>} />
        <Route path="/manage" element={<RequireAuth><ManagePage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
