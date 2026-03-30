import React, { useMemo } from 'react';
import useAppData from '../hooks/useAppData';

const Dashboard = () => {
  const { session, inventory, requests, activeTransfers, hospitalCount } = useAppData();

  const totalUnits = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.units || 0), 0),
    [inventory],
  );

  const heatmap = useMemo(() => {
    const bloodTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
    const availableByType = inventory.reduce((acc, item) => {
      acc[item.bloodType] = (acc[item.bloodType] || 0) + Number(item.units || 0);
      return acc;
    }, {});
    const requestedByType = requests.reduce((acc, item) => {
      acc[item.bloodType] = (acc[item.bloodType] || 0) + Number(item.units || 0);
      return acc;
    }, {});

    return bloodTypes.map((type) => {
      const available = availableByType[type] || 0;
      const needed = requestedByType[type] || 0;
      const shortage = Math.max(0, needed - available);
      const severity = shortage === 0 ? 'ok' : shortage <= 2 ? 'watch' : 'critical';
      return { type, available, needed, shortage, severity };
    });
  }, [inventory, requests]);

  const loggedIn = Boolean(session);
  const isHospital = session?.role === 'Hospital';
  const primaryCta = loggedIn ? (isHospital ? '/hospital' : '/donate') : '/login';
  const primaryLabel = loggedIn ? (isHospital ? 'View Available Donations' : 'Donate blood') : 'Login to continue';


  return (
    <main className="page">
      <section className="hero" id="home">
        <div className="hero__content">
          <p className="eyebrow">BloodLink Console</p>
          <h1>
            {loggedIn ? `Hi ${session.name || 'there'}, pick what you want to do.` : 'Login to donate or search blood.'}
          </h1>
          <p className="lead">
            Individuals can donate. Hospitals can search, filter, and view other hospital data with location-aware
            sorting.
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary" href={primaryCta}>
              {primaryLabel}
            </a>
            {/* <a className="btn btn--ghost" href={secondaryCta}>
              {loggedIn ? 'View activity' : 'Learn more'}
            </a> */}
          </div>
        </div>

        <div className="hero__stats">
          <div className="stat">
            <p className="stat__label">Units ready</p>
            <p className="stat__value">{totalUnits}</p>
            <p className="stat__hint">Crossmatched and stored</p>
          </div>
          <div className="stat">
            <p className="stat__label">Active requests</p>
            <p className="stat__value">{activeTransfers}</p>
            <p className="stat__hint">Blood transfers in progress</p>
          </div>
          <div className="stat">
            <p className="stat__label">Hospitals loaded</p>
            <p className="stat__value">{hospitalCount}</p>
            <p className="stat__hint">Registered hospitals</p>
          </div>
          <div className="stat">
            <p className="stat__label">Status</p>
            <p className="stat__value">{loggedIn ? 'Logged in' : 'Login required'}</p>
            <p className="stat__hint">{loggedIn ? session.role : 'Sign in to continue'}</p>
          </div>
        </div>
      </section>

      <section className="grid grid--two">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Heat map</p>
              <h3>Blood shortage by type</h3>
              <p className="hint">
                Compares active requests vs. available units; darker tiles mean higher shortage.
              </p>
            </div>
          </div>
          <div className="heatmap">
            {heatmap.map((cell) => (
              <div key={cell.type} className={`heatmap__cell heatmap__cell--${cell.severity}`}>
                <p className="heatmap__type">{cell.type}</p>
                <p className="heatmap__numbers">
                  {cell.available} ready / {cell.needed} needed
                </p>
                <p className="heatmap__shortage">
                  {cell.shortage > 0 ? `Short ${cell.shortage}` : 'Stable'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Dashboard;
