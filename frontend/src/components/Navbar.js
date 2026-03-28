import React, { useEffect, useState } from 'react';
import '../styles/Navbar.css';
import { clearSession, getSession } from '../services/mockApi';

const Navbar = () => {
  const [session, setSession] = useState(() => getSession());

  useEffect(() => {
    const interval = setInterval(() => {
      setSession(getSession());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loggedIn = Boolean(session);
  const isHospital = session?.role === 'Hospital';
  const isIndividual = session?.role === 'Individual donor';
  const donateHref = loggedIn && isIndividual ? '/donate' : '/login';
  const receiveHref = loggedIn && isHospital ? '/hospital' : '/login';
  const showDonateLink = !isHospital;
  const showReceiveLink = isHospital;

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <div className="navbar__brand">
          <span className="navbar__logo">Blood<span>Link</span></span>
          <span className="navbar__pill">Trusted</span>
        </div>
        <nav className="navbar__links" aria-label="Primary">
          <a href="/" className="navbar__link">
            Home
          </a>
          {showDonateLink && (
            <a href={donateHref} className="navbar__link">
              Donate
            </a>
          )}
          {showReceiveLink && (
            <a href={receiveHref} className="navbar__link">
              Receive
            </a>
          )}
          <a href="/about" className="navbar__link">
            About
          </a>
          {!loggedIn && (
            <a className="navbar__ghost" href="/login">
              Login
            </a>
          )}
          {loggedIn && (
            <a href="/profile" className="navbar__link">
              Profile
            </a>
          )}
        </nav>
        <div className="navbar__actions">
          {loggedIn ? (
            <>
              <div className="navbar__ghost">
                <span className="navbar__dot" />
                Hi {session.name || 'User'} · {session.role || 'Verified'}
              </div>
              <button
                type="button"
                className="navbar__ghost navbar__ghost--plain"
                onClick={() => {
                  clearSession();
                  setSession(null);
                  window.location.href = '/login';
                }}
              >
                Logout
              </button>
            </>
          ) : null}
          
        </div>
      </div>
    </header>
  );
};

export default Navbar;
