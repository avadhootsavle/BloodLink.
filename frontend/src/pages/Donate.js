import React, { useEffect, useState } from 'react';
import useAppData from '../hooks/useAppData';
import { updateDonorStatus } from '../services/mockApi';

const Donate = () => {
  const { session, setInventory } = useAppData();
  const [donationForm, setDonationForm] = useState({
    isReadyToDonate: session?.isReadyToDonate || false,
    emergencyContact: session?.emergencyContact || false
  });
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setDonationForm({
      isReadyToDonate: session?.isReadyToDonate || false,
      emergencyContact: session?.emergencyContact || false
    });
  }, [session]);

  const handleDonationSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    try {
      const payload = {
        donorId: session?.id,
        isReadyToDonate: donationForm.isReadyToDonate,
        emergencyContact: donationForm.emergencyContact
      };
      
      const { inventory: updatedInventory } = await updateDonorStatus(payload, session);
      setInventory(updatedInventory);
      setSubmitError('Preferences saved successfully!');
      setTimeout(() => setSubmitError(''), 3000);
    } catch (err) {
      setSubmitError('Could not save right now. Try again in a moment.');
    }
  };

  const loggedIn = Boolean(session);
  const isHospital = session?.role === 'Hospital';

  if (!loggedIn) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Identity check</p>
            <h1>Login required</h1>
            <p className="lead">Sign in as an individual donor to publish available units.</p>
            <a className="btn btn--primary" href="/login">
              Go to login
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (isHospital) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Donate</p>
            <h1>Only individual donors can donate.</h1>
            <p className="lead">Switch to an individual account or use the hospital console to find blood.</p>
            <a className="btn btn--primary" href="/hospital">
              Go to hospital console
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="grid" id="donate" style={{ maxWidth: '650px', margin: '0 auto' }}>
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Donate</p>
              <h3>Manage your donor status</h3>
              <p className="hint">Review your information and toggle your availability below.</p>
            </div>
            <div className="pill pill--ghost">Verified Donors Only</div>
          </div>
          
          <div className="inventory-list" style={{ marginBottom: '2rem' }}>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Name</h4>
                <p className="hint">{session?.name || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Email</h4>
                <p className="hint">{session?.email || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Blood Group</h4>
                <p className="hint">{session?.bloodGroup || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Gender</h4>
                <p className="hint">{session?.gender || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Date of Birth</h4>
                <p className="hint">
                  {session?.birthdate ? new Date(session.birthdate).toLocaleDateString() : 'Not provided'}
                </p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Registered Address</h4>
                <p className="hint">{session?.city || 'Not provided'}</p>
              </div>
            </div>
            {session?.location && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Coordinates</h4>
                  <p className="hint">
                    Lat: {session.location.lat.toFixed(4)}, Lng: {session.location.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <form className="form" onSubmit={handleDonationSubmit} style={{ borderTop: '1px solid #eaeaea', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={donationForm.isReadyToDonate} 
                    onChange={(e) => setDonationForm({...donationForm, isReadyToDonate: e.target.checked})} 
                  />
                  <span className="toggle-slider"></span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.2rem' }}>Ready to Donate</strong>
                  <p className="hint" style={{ margin: 0, fontSize: '0.9rem' }}>Allows hospitals to see you in the active inventory.</p>
                </div>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={donationForm.emergencyContact} 
                    onChange={(e) => setDonationForm({...donationForm, emergencyContact: e.target.checked})} 
                  />
                  <span className="toggle-slider"></span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.2rem' }}>Emergency Donor</strong>
                  <p className="hint" style={{ margin: 0, fontSize: '0.9rem' }}>Permit emergency notifications when severe shortages occur.</p>
                </div>
              </label>
            </div>

            <button type="submit" className="btn btn--primary" style={{ width: '100%', padding: '0.75rem' }}>
              Save Preferences
            </button>
            {submitError && (
               <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <p className="hint" style={{ color: submitError.includes('success') ? 'green' : 'red', fontWeight: 500, margin: 0 }}>
                  {submitError}
                </p>
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
};

export default Donate;
