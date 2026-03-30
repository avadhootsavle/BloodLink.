import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useAppData from '../hooks/useAppData';
import { addRequest, consumeDonation, fetchTransfers, completeTransfer } from '../services/mockApi';
import { emitToast } from '../components/ToastProvider';

const bloodTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

const cityCoordinates = {
  pune: { lat: 18.5204, lng: 73.8567 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  delhi: { lat: 28.7041, lng: 77.1025 },
};

const getCoordsForCity = (city) => cityCoordinates[city?.toLowerCase()] || null;

const getAge = (birthdate) => {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return null;

  let age = new Date().getFullYear() - dob.getFullYear();
  const monthDiff = new Date().getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const Hospital = () => {
  const { session, inventory, setInventory, setRequests } = useAppData();
  const [bloodFilter, setBloodFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [userPosition, setUserPosition] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [alertResult, setAlertResult] = useState(null);
  const [emergencyForm, setEmergencyForm] = useState({
    bloodType: 'O+',
    clinicalReason: 'Emergency need',
  });
  const [useHospitalLocation, setUseHospitalLocation] = useState(false);
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    if (session?.id) {
      fetchTransfers(session.id).then(setTransfers).catch(console.error);
    }
  }, [session?.id]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError('');
      },
      () => setLocationError('Location blocked; sorting by city.'),
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, []);

  const basePosition = useMemo(() => {
    if (useHospitalLocation && session?.location) return session.location;
    return userPosition;
  }, [useHospitalLocation, userPosition, session?.location]);

  const distanceKm = useCallback(
    (coords) => {
      if (!basePosition || !coords) return null;
      const toRad = (deg) => (deg * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(coords.lat - basePosition.lat);
      const dLng = toRad(coords.lng - basePosition.lng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(basePosition.lat)) * Math.cos(toRad(coords.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    },
    [basePosition],
  );

  const filteredInventory = useMemo(() => {
    let list = inventory;
    if (bloodFilter) list = list.filter((item) => item.bloodType === bloodFilter);
    if (cityFilter) list = list.filter((item) => item.city === cityFilter);
    return [...list].sort((a, b) => {
      const coordsA = a.location || getCoordsForCity(a.city);
      const coordsB = b.location || getCoordsForCity(b.city);
      const da = distanceKm(coordsA) ?? Number.MAX_VALUE;
      const db = distanceKm(coordsB) ?? Number.MAX_VALUE;
      return da - db;
    });
  }, [inventory, bloodFilter, cityFilter, distanceKm]);

  const cityOptions = useMemo(
    () => Array.from(new Set(inventory.map((item) => item.city))).sort(),
    [inventory],
  );

  const handleTakeDonation = async (id) => {
    try {
      const result = await consumeDonation(id, session.id);
      setInventory(result.inventory || []);
      // Refresh the transfers list
      const updatedTransfers = await fetchTransfers(session.id);
      setTransfers(updatedTransfers);
      if (result.emailSent) {
        emitToast({
          title: 'Request sent',
          message: `Email sent to ${result.donorName} at ${result.donorEmail}.`,
          type: 'success',
        });
      } else if (result.emailError) {
        emitToast({
          title: 'Email issue',
          message: `Unit assigned, but email failed: ${result.emailError}`,
          type: 'warning',
        });
      } else {
        emitToast({
          title: 'Unit assigned',
          message: 'Unit assigned. No donor email was sent.',
          type: 'info',
        });
      }
    } catch (err) {
      console.error('Failed to take donation:', err);
      emitToast({
        title: 'Request failed',
        message: err.message || 'Failed to assign the unit.',
        type: 'warning',
      });
    }
  };

  const handleEmergencyAlert = async (event) => {
    event.preventDefault();
    try {
      const result = await addRequest(
        {
          bloodType: emergencyForm.bloodType,
          urgency: 'Critical',
          clinicalReason: emergencyForm.clinicalReason || 'Emergency alert',
          requestedBy: session?.organization || session?.name || 'Hospital',
          contact: session?.email || 'On file',
        },
        session,
      );
      setRequests(result.requests);
      setAlertResult({
        total: result.totalMatches,
        notifiedCount: result.notifiedCount,
        preview: result.preview,
        emailEnabled: result.emailEnabled,
        emailErrors: result.emailErrors,
      });
      emitToast({
        title: 'Emergency alert sent',
        message: `Matched ${result.totalMatches} donor${result.totalMatches === 1 ? '' : 's'} and emailed ${result.notifiedCount}.`,
        type: 'success',
      });
    } catch (err) {
      setAlertResult({
        total: 0,
        notifiedCount: 0,
        preview: [],
        emailEnabled: false,
        emailErrors: [err.message],
      });
      emitToast({
        title: 'Emergency alert failed',
        message: err.message || 'Could not send the alert.',
        type: 'warning',
      });
    }
  };

  const loggedIn = Boolean(session);
  const isHospital = session?.role === 'Hospital';

  if (!loggedIn || !isHospital) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Hospital console</p>
            <h1>Hospital access only</h1>
            <p className="lead">
              Please log in as a hospital to view available blood, filter, and transfer units.
            </p>
            <a className="btn btn--primary" href="/login">
              Go to login
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="grid">
        <div className="panel panel--accent">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Emergency alert</p>
              <h3>Page nearby donors now</h3>
              <p className="hint">
                Sends an urgent request, writes it to the system, and highlights compatible donors instantly.
              </p>
            </div>
            <div className="pill pill--ghost">Critical channel</div>
          </div>
          <form className="form" onSubmit={handleEmergencyAlert}>
            <div className="form__row">
              <label>
                Needed blood group
                <select
                  value={emergencyForm.bloodType}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, bloodType: e.target.value })}
                >
                  {bloodTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Note to donors
              <input
                type="text"
                placeholder="Reason / instructions"
                value={emergencyForm.clinicalReason}
                onChange={(e) => setEmergencyForm({ ...emergencyForm, clinicalReason: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn--primary">Send emergency alert</button>
          </form>
          {alertResult ? (
            <div className="inventory-list" style={{ marginTop: '0.6rem' }}>
              <p className="hint">
                Alert dispatched. Found {alertResult.total} compatible donor entr{alertResult.total === 1 ? 'y' : 'ies'}.
                {alertResult.emailEnabled
                  ? ` Email sent to ${alertResult.notifiedCount} donor${alertResult.notifiedCount === 1 ? '' : 's'}.`
                  : ' Email sending is not configured yet.'}
              </p>
              {alertResult.emailErrors?.length ? (
                <p className="hint" style={{ color: '#8f1021' }}>
                  Email issue: {alertResult.emailErrors[0]}
                </p>
              ) : null}
              {alertResult.preview.map((match) => (
                <div key={match.id} className="inventory-row">
                  <div className="pill pill--ghost">{match.bloodType}</div>
                  <div className="inventory-row__meta">
                    <h4>{match.donorName || 'Verified donor'}</h4>
                    <p className="hint">
                      {match.city || 'No city'} · Ready donor
                    </p>
                  </div>
                  <div className="inventory-row__contact">
                    <p className="inventory-row__contact-label">Contact</p>
                    <p>{match.email || 'On file'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid" id="hospital-tools">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Hospital tools</p>
              <h3>Search and filter blood availability</h3>
              <p className="hint">Filter by blood type, city, and minimum units. Location sorts nearest first.</p>
            </div>
            <div className="pill pill--ghost">
              {basePosition
                ? useHospitalLocation
                  ? 'Using registered hospital address'
                  : 'Using current browser location'
                : 'Location not set'}
            </div>
          </div>

          <div className="form">
            <div className="form__row">
              <label>
                Blood type
                <select value={bloodFilter} onChange={(e) => setBloodFilter(e.target.value)}>
                  <option value="">Any</option>
                  {bloodTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Address
                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                  <option value="">Any</option>
                  {cityOptions.map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form__row" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={useHospitalLocation} 
                  onChange={(e) => {
                    setUseHospitalLocation(e.target.checked);
                    setLocationError(!session?.location && e.target.checked ? 'No registered hospital location found.' : '');
                  }} 
                  style={{ width: '1.2rem', height: '1.2rem', margin: 0 }} 
                />
                <div style={{ flex: 1, margin: 0 }}>
                  <strong style={{ fontSize: '0.95rem' }}>Filter to nearest from my Hospital Address</strong>
                </div>
              </label>
            </div>
            {locationError && <p className="hint">{locationError}</p>}
          </div>

          <div className="inventory-list">
            {filteredInventory.map((item) => {
              const coords = item.location || getCoordsForCity(item.city);
              const dist = distanceKm(coords);
              return (
                <div key={item.id} className="inventory-row">
                  <div className="pill pill--ghost">{item.bloodType}</div>
                  <div className="inventory-row__meta">
                    <h4>
                      {item.donorName || 'Verified donor'}
                    </h4>
                    <p className="hint">
                      Age: {item.age ?? 'N/A'} · Blood Type: {item.bloodType || 'N/A'}
                    </p>
                    <p className="hint">
                      Address: {item.address || item.city || 'Not provided'}
                    </p>
                  </div>
                  <div className="inventory-row__contact">
                    <p className="inventory-row__contact-label">Contact</p>
                    <p>{item.contactNumber || 'Phone not provided'}</p>
                    <p className="hint">{item.email || 'Email not provided'}</p>
                    {dist ? <p className="hint">~{dist} km away</p> : null}
                  </div>
                  <button className="btn btn--ghost" onClick={() => handleTakeDonation(item.id)}>
                    Take units
                  </button>
                </div>
              );
            })}
            {!filteredInventory.length && <p className="hint">No inventory found.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Active Transfers</p>
              <h3>Donors you have requested</h3>
              <p className="hint">Track the blood units you have claimed from individual donors.</p>
            </div>
            <div className="pill pill--warning" style={{ color: '#d97706', borderColor: '#fcd34d', backgroundColor: '#fef3c7' }}>Pending / Accepted</div>
          </div>
          <div className="inventory-list">
            {transfers.filter(tx => tx.status === 'In Progress' || tx.status === 'Accepted').map((tx) => (
              <div key={tx._id} className="inventory-row">
                <div className="pill pill--ghost">{tx.donorId?.bloodGroup || '?'}</div>
                <div className="inventory-row__meta">
                  <h4>{tx.donorId?.name || 'Anonymous Donor'}</h4>
                  <p className="hint">
                    Age: {getAge(tx.donorId?.birthdate) ?? 'N/A'} · {tx.donorId?.bloodGroup || '?'} · {tx.status}
                  </p>
                  <p className="hint">
                    Address: {tx.donorId?.city || 'No city'}
                  </p>
                  {tx.status === 'Accepted' ? (
                    <p className="hint">Donor accepted. Call now to schedule the appointment.</p>
                  ) : null}
                </div>
                <div className="inventory-row__contact">
                  <p className="inventory-row__contact-label">Contact</p>
                  <p>{tx.donorId?.contactNumber || 'Phone not provided'}</p>
                  <p className="hint">{tx.donorId?.email || 'On file'}</p>
                    <p className="hint">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                <button className="btn btn--primary" style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }} onClick={async () => {
                  try {
                    await completeTransfer(tx._id);
                    const updated = await fetchTransfers(session.id);
                    setTransfers(updated);
                  } catch (err) {
                    console.error('Failed to complete transfer:', err);
                  }
                }}>
                  Mark Completed
                </button>
              </div>
            ))}
            {!transfers.filter(tx => tx.status === 'In Progress' || tx.status === 'Accepted').length && <p className="hint">No active transfers yet. Click "Take units" above to claim a donor.</p>}
          </div>
        </div>

      </section>
    </main>
  );
};

export default Hospital;
