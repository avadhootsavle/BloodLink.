import React from 'react';
import '../styles/Footer.css';


const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer-simple">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">
            Blood<span className="logo-highlight">Link</span>
          </div>
          <p className="footer-tagline">
            A unified response layer for donors, hospitals, and blood banks when urgency leaves no room for delay.
          </p>
        </div>

        <div className="footer-links">
          <div>
            <h4>Navigate</h4>
            <ul>
              <li><a href="/">Dashboard</a></li>
              <li><a href="/donate">Donate</a></li>
              <li><a href="/hospital">Hospital Console</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul>
              <li><a href="/login">Login</a></li>
              <li><a href="/signup">Sign Up</a></li>
              <li><a href="/profile">Profile</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <div className="footer-pills">
          <span className="footer-pill">24/7 Response</span>
          <span className="footer-pill pill-verified">Verified Network</span>
        </div>
        <p className="footer-center-text">
          © {currentYear} BloodLink. Designed for critical coordination.
        </p>
        <p className="footer-center-text">
          Made by Avadhoot Savle, Kavya Kaushik, Krish Shah
        </p>
      </div>
    </footer>
  );
};

export default Footer;
