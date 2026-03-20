import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { MeetingSummarizer } from './components/MeetingSummarizer';
import { MeetingHistory } from './components/MeetingHistory';
import { PMDashboard } from './components/PMDashboard';
import { PRDGenerator } from './components/PRDGenerator';
import { UserStoriesGenerator } from './components/UserStoriesGenerator';
import { SprintPlanner } from './components/SprintPlanner';
import KnowledgeChat from './components/KnowledgeChat';
import { ReminderManager } from './components/ReminderManager';
import { SplashCursor } from './components/SplashCursor';
import IntroPage from './components/IntroPage';
import { ThemeProvider } from './context/ThemeContext';
import { RecordingProvider } from './context/RecordingContext';
import { AuthenticatedLayout } from './components/AuthenticatedLayout';
import { supabase } from './lib/supabase';


function App() {
  const [session, setSession] = useState<any>(null);
  const [showIntro, setShowIntro] = useState(() => {
    return !sessionStorage.getItem('hasSeenIntro');
  });

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
      <RecordingProvider>
        <ReminderManager />
        <SplashCursor />
        <Router>
          {showIntro ? (
            <IntroPage onComplete={() => {
              sessionStorage.setItem('hasSeenIntro', 'true');
              setShowIntro(false);
            }} />
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to={session ? "/summarizer" : "/auth"} replace />} />
              
              {/* Protected Routes with Persistent Layout */}
              <Route
                path="/summarizer"
                element={session ? <AuthenticatedLayout><MeetingSummarizer /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/history"
                element={session ? <AuthenticatedLayout><MeetingHistory /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/pm-dashboard"
                element={session ? <AuthenticatedLayout><PMDashboard /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/prd-generator"
                element={session ? <AuthenticatedLayout><PRDGenerator /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/user-stories"
                element={session ? <AuthenticatedLayout><UserStoriesGenerator /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/sprint-planner"
                element={session ? <AuthenticatedLayout><SprintPlanner /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              <Route
                path="/ai-chat"
                element={session ? <AuthenticatedLayout><KnowledgeChat /></AuthenticatedLayout> : <Navigate to="/auth" />}
              />
              
              <Route path="/auth" element={<Auth />} />
            </Routes>
          )}
        </Router>
      </RecordingProvider>
    </ThemeProvider>
  );
}

export default App;
