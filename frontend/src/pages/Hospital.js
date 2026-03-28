import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useAppData from '../hooks/useAppData';
import { addRequest, consumeDonation, findMatches } from '../services/mockApi';

const bloodTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

const cityCoordinates = {
  pune: { lat: 18.5204, lng: 73.8567 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  delhi: { lat: 28.7041, lng: 77.1025 },
};

const getCoordsForCity = (city) => cityCoordinates[city?.toLowerCase()] || null;

const Hospital = () => {
  const { session, inventory, setInventory, setRequests } = useAppData();
  const [bloodFilter, setBloodFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [userPosition, setUserPosition] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [alertResult, setAlertResult] = useState(null);
  const [emergencyForm, setEmergencyForm] = useState({
    bloodType: 'O+',
    units: 2,
    city: '',
    clinicalReason: 'Emergency need',
    contact: '',
  });
  const [useHospitalLocation, setUseHospitalLocation] = useState(false);

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
      const updated = await consumeDonation(id, session.id);
      setInventory(updated);
    } catch (err) {
      console.error('Failed to take donation:', err);
    }
  };

  const handleEmergencyAlert = (event) => {
    event.preventDefault();
    const matches = findMatches(emergencyForm.bloodType).filter((m) =>
      emergencyForm.city ? m.city?.toLowerCase() === emergencyForm.city.toLowerCase() : true,
    );

    const { requests: updatedRequests } = addRequest(
      {
        bloodType: emergencyForm.bloodType,
        units: emergencyForm.units,
        city: emergencyForm.city || session?.organization || '',
        urgency: 'Critical',
        clinicalReason: emergencyForm.clinicalReason || 'Emergency alert',
        requestedBy: session?.organization || session?.name || 'Hospital',
        contact: emergencyForm.contact || session?.email || 'On file',
      },
      session,
    );
    setRequests(updatedRequests);

    setAlertResult({
      total: matches.length,
      preview: matches.slice(0, 3),
    });
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
                Needed type
                <select
                  value={emergencyForm.bloodType}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, bloodType: e.target.value })}
                >
                  {bloodTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Units needed
                <input
                  type="number"
                  min="1"
                  value={emergencyForm.units}
                  onChange={(e) =>
                    setEmergencyForm({ ...emergencyForm, units: Number(e.target.value || 0) })
                  }
                  required
                />
              </label>
            </div>
            <div className="form__row">
              <label>
                City (optional)
                <input
                  type="text"
                  placeholder="e.g., Pune"
                  value={emergencyForm.city}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, city: e.target.value })}
                />
              </label>
              <label>
                Contact for callbacks
                <input
                  type="text"
                  placeholder="Phone / email"
                  value={emergencyForm.contact}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, contact: e.target.value })}
                />
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
                Alert dispatched. Found {alertResult.total} compatible donor entr{alertResult.total === 1 ? 'y' : 'ies'}
                {alertResult.preview.length ? ' to notify:' : '.'}
              </p>
              {alertResult.preview.map((match) => (
                <div key={match.id} className="inventory-row">
                  <div className="pill pill--ghost">{match.bloodType}</div>
                  <div className="inventory-row__meta">
                    <h4>{match.hospital || 'Verified donor'}</h4>
                    <p className="hint">
                      {match.units} units · {match.city || 'No city'} · {match.status || 'Available'}
                    </p>
                  </div>
                  <div className="inventory-row__contact">
                    <p className="inventory-row__contact-label">Contact</p>
                    <p>{match.contact || 'On file'}</p>
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
                      {item.units} units · {item.hospital}
                    </h4>
                    <p className="hint">
                      {item.city} · {item.status}
                    </p>
                  </div>
                  <div className="inventory-row__contact">
                    <p className="inventory-row__contact-label">Contact</p>
                    <p>{item.contact}</p>
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

        {/* <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Hospital directory</p>
              <h3>Access partner hospital data</h3>
              <p className="hint">View bank partners and reach verified hospital teams.</p>
            </div>
          </div>
          <div className="inventory-list">
            {filteredHospitals.map((hospital) => {
              const dist = distanceKm(getCoordsForCity(hospital.city));
              return (
                <div key={hospital.id} className="inventory-row">
                  <div className="pill pill--ghost">{hospital.city}</div>
                  <div className="inventory-row__meta">
                    <h4>{hospital.name}</h4>
                    <p className="hint">
                      Bank partner: {hospital.bankPartner} · Ready types: {hospital.readyTypes.join(', ')}
                    </p>
                  </div>
                  <div className="inventory-row__contact">
                    <p className="inventory-row__contact-label">Contact</p>
                    <p>{hospital.contact}</p>
                    <p className="hint">{hospital.email}</p>
                    {dist ? <p className="hint">~{dist} km away</p> : null}
                  </div>
                </div>
              );
            })}
            {!filteredHospitals.length && <p className="hint">No hospitals match these filters.</p>}
          </div>
        </div> */}
      </section>
    </main>
  );
};

export default Hospital;
