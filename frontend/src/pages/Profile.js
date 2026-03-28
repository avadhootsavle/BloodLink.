import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSession } from '../services/mockApi';

const Profile = () => {
  const [session, setSession] = useState(() => getSession());

  useEffect(() => {
    const id = setInterval(() => setSession(getSession()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <p className="eyebrow">Profile</p>
        <h1>Hi {session.name || 'User'}, here are your details.</h1>
        <p className="lead">
          Role-based access powers your experience. Hospitals see search/filter tools, individuals
          can donate or request blood.
        </p>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Identity</p>
              <h3>Account</h3>
            </div>
          </div>
          <div className="inventory-list">
            {session.role !== 'Hospital' && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Name</h4>
                  <p className="hint">{session.name || 'Not provided'}</p>
                </div>
              </div>
            )}
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Email</h4>
                <p className="hint">{session.email || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Role</h4>
                <p className="hint">{session.role || 'Not set'}</p>
              </div>
            </div>

            {session.role === 'Hospital' && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Organization</h4>
                  <p className="hint">{session.organization || 'Not provided'}</p>
                </div>
              </div>
            )}

            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Address</h4>
                <p className="hint">{session.city || 'Not provided'}</p>
              </div>
            </div>
            {session.location && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Coordinates</h4>
                  <p className="hint">
                    Lat: {session.location.lat.toFixed(4)}, Lng: {session.location.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            )}

            {session.role === 'Individual donor' && (
              <>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Blood Group</h4>
                    <p className="hint">{session.bloodGroup || 'Not provided'}</p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Gender</h4>
                    <p className="hint">{session.gender || 'Not provided'}</p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Date of Birth</h4>
                    <p className="hint">
                      {session.birthdate ? new Date(session.birthdate).toLocaleDateString() : 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Donation Status</h4>
                    <p className="hint">
                      {session.isReadyToDonate ? 'Ready to donate (Active on Inventory)' : 'Not actively donating'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Profile;
