import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ToastProvider, { emitToast } from './components/ToastProvider';
import Homepage from './pages/Homepage';
import Dashboard from './pages/Dashboard';
import Donate from './pages/Donate';
import Hospital from './pages/Hospital';
import About from './pages/About';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import DonorLogs from './pages/DonorLogs';
import HospitalLogs from './pages/HospitalLogs';
import { fetchDonorBadges, getSession } from './services/mockApi';
import './App.css';

const BadgeUnlockWatcher = () => {
  const location = useLocation();

  useEffect(() => {
    const session = getSession();
    if (!session?.id || session.role !== 'Individual donor') return;

    fetchDonorBadges(session.id)
      .then((summary) => {
        const storageKey = `bloodlink_seen_badges_${session.id}`;
        const unlockedIds = summary.badges.filter((badge) => badge.unlocked).map((badge) => badge.id);
        const seenIds = JSON.parse(localStorage.getItem(storageKey) || 'null');

        if (!seenIds) {
          localStorage.setItem(storageKey, JSON.stringify(unlockedIds));
          return;
        }

        summary.badges
          .filter((badge) => badge.unlocked && !seenIds.includes(badge.id))
          .forEach((badge) => {
            emitToast({
              title: 'Badge unlocked',
              message: `You have unlocked the ${badge.name} badge.`,
              type: 'success',
            });
          });

        localStorage.setItem(storageKey, JSON.stringify(unlockedIds));
      })
      .catch(() => {});
  }, [location.pathname]);

  return null;
};

const AppShell = () => (
  <div className="App">
    <Navbar />
    <BadgeUnlockWatcher />
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/home" element={<Homepage />} />
      <Route path="/donate" element={<Donate />} />
      <Route path="/hospital" element={<Hospital />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/donor-logs" element={<DonorLogs />} />
      <Route path="/hospital-logs" element={<HospitalLogs />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <Footer />
  </div>
);

function App() {
  return (
    <Router>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </Router>
  );
}

export default App;
