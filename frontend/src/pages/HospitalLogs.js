import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchTransfers, getSession } from '../services/mockApi';

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

const HospitalLogs = () => {
  const [session, setSession] = useState(() => getSession());
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    const id = setInterval(() => setSession(getSession()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    fetchTransfers(session.id).then(setTransfers).catch(console.error);
  }, [session?.id]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.role !== 'Hospital') {
    return <Navigate to="/donor-logs" replace />;
  }

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <p className="eyebrow">Hospital Logs</p>
        <h1>Donor request history</h1>
        <p className="lead">Track every donor your hospital requested, with contact details, outcomes, and timestamps.</p>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">History</p>
              <h3>Transfer request log</h3>
            </div>
            <div className="pill pill--ghost">{transfers.length} records</div>
          </div>
          <div className="inventory-list">
            {transfers.map((tx) => (
              <div key={tx._id} className="inventory-row">
                <div className="pill pill--ghost">{tx.donorId?.bloodGroup || '?'}</div>
                <div className="inventory-row__meta">
                  <h4>{tx.donorId?.name || 'Anonymous Donor'}</h4>
                  <p className="hint">
                    Age: {getAge(tx.donorId?.birthdate) ?? 'N/A'} · {tx.status}
                  </p>
                  <p className="hint">Address: {tx.donorId?.city || 'No city'}</p>
                  <p className="hint">
                    {tx.status === 'Completed'
                      ? 'Donation completed successfully.'
                      : tx.status === 'Accepted'
                        ? 'Donor accepted. Appointment coordination can proceed.'
                        : tx.status === 'Cancelled'
                          ? 'Donor rejected this request.'
                          : 'Waiting for donor response.'}
                  </p>
                </div>
                <div className="inventory-row__contact">
                  <p className="inventory-row__contact-label">Timeline</p>
                  <p>{new Date(tx.createdAt).toLocaleString()}</p>
                  <p className="hint">{tx.donorId?.contactNumber || 'Phone not provided'}</p>
                  <p className="hint">{tx.donorId?.email || 'Email not provided'}</p>
                </div>
              </div>
            ))}
            {!transfers.length && <p className="hint">No history yet.</p>}
          </div>
        </div>
      </section>
    </main>
  );
};

export default HospitalLogs;
