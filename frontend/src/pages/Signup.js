import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signupUser } from '../services/mockApi';



// Replaced mock nearest-city logic with real OSM Geocoding.

const Signup = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organization: '',
    role: 'Individual donor',
    bloodGroup: 'O+',
    gender: 'Male',
    birthdate: '',
    city: '',
    location: null
  });
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [userPosition, setUserPosition] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setLeafletReady(true);
      document.body.appendChild(script);
    } else {
      setLeafletReady(true);
    }
  }, []);

  useEffect(() => {
    const center = userPosition || { lat: 20.5937, lng: 78.9629 }; // default center (India)
    if (!leafletReady || !mapRef.current || !center || !window.L) return;
    
    if (!mapInstance.current) {
      mapInstance.current = window.L.map(mapRef.current).setView([center.lat, center.lng], userPosition ? 13 : 5);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapInstance.current);
    } else if (userPosition) { // Smooth fly to location once entered
      mapInstance.current.setView([center.lat, center.lng], 13);
    }
    
    if (markerRef.current) {
      mapInstance.current.removeLayer(markerRef.current);
    }
    if (userPosition) {
      markerRef.current = window.L.marker([center.lat, center.lng]).addTo(mapInstance.current);
    }
  }, [leafletReady, userPosition]);

  const handleDetectLocation = () => {
    setLocationError('');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserPosition(coords);
          setForm((prev) => ({ ...prev, location: coords }));
          
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.display_name) {
                setForm((prev) => ({ ...prev, city: data.display_name }));
              }
            }
          } catch (err) {
            console.error('Reverse geocoding failed', err);
          }
        },
        () => setLocationError('Location blocked; enter address manually.'),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setLocationError('Geolocation not supported by browser.');
    }
  };

  const handleAddressSearch = async (address) => {
    if (!address || address.trim().length < 3) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          setUserPosition(coords);
          setForm((prev) => ({ ...prev, location: coords }));
        }
      }
    } catch (err) {
      console.error('Forward geocoding failed', err);
    }
  };

  React.useEffect(() => {
    if (!form.city || form.city.trim().length < 3) return;
    
    // Auto map the address the user typed in after they finish typing (1s debounce)
    const timeoutId = setTimeout(() => {
      handleAddressSearch(form.city);
    }, 1000);
    
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.city]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    
    if (form.role === 'Individual donor') {
      const dob = new Date(form.birthdate);
      let calcAge = new Date().getFullYear() - dob.getFullYear();
      const m = new Date().getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) {
        calcAge--;
      }
      if (calcAge < 18) {
        setError('You must be at least 18 years old to sign up as a donor.');
        return;
      }
    }

    try {
      await signupUser(form);
      navigate('/');
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      setError(err.message || 'Signup failed.');
    }
  };

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <div>
          <p className="eyebrow">Join the network</p>
          <h1>Create an account</h1>
          <p className="lead">
            Select your role to access the right tools.
          </p>
        </div>
      </section>

      <section className="grid login-grid" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Sign up</h3>
            </div>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {error && <p className="hint" style={{ color: 'red' }}>{error}</p>}
            
            <div className="role-switch">
              {['Individual donor', 'Hospital'].map((roleOption) => (
                <button
                  type="button"
                  key={roleOption}
                  className={`chip ${form.role === roleOption ? 'chip--active' : ''}`}
                  onClick={() =>
                    setForm({
                      ...form,
                      role: roleOption,
                      name: roleOption === 'Hospital' ? '' : form.name,
                      organization: roleOption === 'Hospital' ? form.organization : '',
                      bloodGroup: roleOption === 'Hospital' ? '' : (form.bloodGroup || 'O+'),
                      gender: roleOption === 'Hospital' ? '' : (form.gender || 'Male'),
                      birthdate: roleOption === 'Hospital' ? '' : form.birthdate
                    })
                  }
                >
                  {roleOption}
                </button>
              ))}
            </div>

            {form.role === 'Individual donor' && (
              <>
                <label>
                  Full name
                  <input
                    type="text"
                    value={form.name}
                    required
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Full Name"
                  />
                </label>
                <div className="form__row">
                  <label>
                    Date of Birth
                    <input
                      type="date"
                      value={form.birthdate}
                      required
                      onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                    />
                  </label>
                  <label>
                    Gender
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      {['Male', 'Female', 'Other'].map(gen => (
                        <option key={gen} value={gen}>{gen}</option>
                      ))}
                    </select>
                  </label>
                </div>
                
                <label>
                  Blood Group
                  <select
                    value={form.bloodGroup}
                    onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                  >
                    {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </label>

              </>
            )}

            {form.role === 'Hospital' && (
              <label>
                Hospital name
                <input
                  type="text"
                  value={form.organization}
                  required
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  placeholder="Hospital / Bank name"
                />
              </label>
            )}

            <label>
              Full Address
              <input
                type="text"
                value={form.city}
                required
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Enter your full address"
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  className="btn btn--ghost" 
                  style={{ padding: '0.5rem' }} 
                  onClick={handleDetectLocation}
                >
                  Auto-detect GPS
                </button>
              </div>
              {locationError && <p className="hint" style={{ marginTop: '0.25rem' }}>{locationError}</p>}
            </label>
            
            <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <div id="signup-map" ref={mapRef} style={{ height: '200px', width: '100%', borderRadius: '12px', border: '1px solid #ddd' }} />
              {userPosition ? (
                <p className="hint" style={{ marginTop: '0.5rem' }}>
                  Coordinates: Lat {userPosition.lat.toFixed(4)}, Lng {userPosition.lng.toFixed(4)}
                </p>
              ) : (
                <p className="hint" style={{ marginTop: '0.5rem' }}>
                  Type an address above to map your exact location.
                </p>
              )}
            </div>

            <label>
              Email
              <input
                type="email"
                value={form.email}
                required
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="abc@domain.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={form.password}
                required
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </label>

            <button type="submit" className="btn btn--primary">
              Create Account
            </button>
            <p className="hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
              Already have an account? <Link to="/login">Log in here</Link>.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Signup;
