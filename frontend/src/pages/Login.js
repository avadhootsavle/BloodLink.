import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser, getSession } from '../services/mockApi';

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginUser(form);
      navigate('/');
      // Trigger a storage event manually to update hooks across the app
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <div>
          <p className="eyebrow">Secure access</p>
          <h1>Welcome back to BloodLink.</h1>
          <p className="lead">
            Sign in below to coordinate donations and requests.
          </p>
        </div>
      </section>

      <section className="grid login-grid" style={{ maxWidth: '400px', margin: '0 auto' }}>
        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Log in</h3>
              <p className="hint">Enter your registered email and password.</p>
            </div>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {error && <p className="hint" style={{ color: 'red' }}>{error}</p>}
            
            <label>
              Email
              <input
                type="email"
                value={form.email}
                required
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="abc@gmail.com"
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
              Sign In
            </button>
            <p className="hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
              Don't have an account? <Link to="/signup">Sign up here</Link>.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Login;
