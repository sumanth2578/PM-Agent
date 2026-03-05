import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { MeetingSummarizer } from './components/MeetingSummarizer';
import { MeetingHistory } from './components/MeetingHistory';
import { PMDashboard } from './components/PMDashboard';
import { PRDGenerator } from './components/PRDGenerator';
import { UserStoriesGenerator } from './components/UserStoriesGenerator';
import { SprintPlanner } from './components/SprintPlanner';
import { CursorGlow } from './components/CursorGlow';
import { ThemeProvider } from './context/ThemeContext';
import { supabase } from './lib/supabase';


function App() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ThemeProvider>
      <CursorGlow />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/auth" />} />
          <Route
            path="/summarizer"
            element={session ? <MeetingSummarizer /> : <Navigate to="/auth" />}
          />
          <Route
            path="/history"
            element={session ? <MeetingHistory /> : <Navigate to="/auth" />}
          />
          <Route
            path="/pm-dashboard"
            element={session ? <PMDashboard /> : <Navigate to="/auth" />}
          />
          <Route
            path="/prd-generator"
            element={session ? <PRDGenerator /> : <Navigate to="/auth" />}
          />
          <Route
            path="/user-stories"
            element={session ? <UserStoriesGenerator /> : <Navigate to="/auth" />}
          />
          <Route
            path="/sprint-planner"
            element={session ? <SprintPlanner /> : <Navigate to="/auth" />}
          />
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
