import React from 'react';

const About = () => {
  return (
    <main className="page">
      <section className="hero hero--narrow">
        <p className="eyebrow">Why this exists</p>
        <h1>BloodLink keeps inventory honest and urgent requests visible.</h1>
        <p className="lead">
          The same interface donors use is the one hospitals see. Every donation and request passes
          through the mock backend so scammy claims are easy to spot and audit.
        </p>
      </section>

      <section className="page__stacked about-grid">
        <div className="card">
          <h3>Frontend</h3>
          <p>
            React with a single-page experience, sticky navigation, and sections that map to the
            donation and receive workflows. Forms validate required data, scroll targets make it easy
            to jump to Donate, Receive, and Inventory.
          </p>
        </div>
        <div className="card">
          <h3>Backend mock</h3>
          <p>
            A lightweight localStorage API stores donations, requests, and sessions. We seed the app
            with realistic inventory and requests, then update counts immediately when you publish or
            submit a request.
          </p>
        </div>
        <div className="card">
          <h3>Safety</h3>
          <p>
            Login captures role, organization, and contact info so every action is traceable. Basic
            blood-type compatibility rules power the matching view to surface viable donors first.
          </p>
        </div>
      </section>
    </main>
  );
};

export default About;
