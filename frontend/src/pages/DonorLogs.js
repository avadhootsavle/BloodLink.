import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchTransfers, getSession } from '../services/mockApi';

const DonorLogs = () => {
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

  if (session.role !== 'Individual donor') {
    return <Navigate to="/hospital-logs" replace />;
  }

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <p className="eyebrow">Donor Logs</p>
        <h1>Donation request history</h1>
        <p className="lead">See every hospital that requested your blood, the status, and when it happened.</p>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">History</p>
              <h3>Hospital request log</h3>
            </div>
            <div className="pill pill--ghost">{transfers.length} records</div>
          </div>
          <div className="inventory-list">
            {transfers.map((tx) => (
              <div key={tx._id} className="inventory-row">
                <div className="pill pill--ghost">{tx.donorId?.bloodGroup || session.bloodGroup || '?'}</div>
                <div className="inventory-row__meta">
                  <h4>{tx.hospitalId?.organization || tx.hospitalId?.name || 'Verified Hospital'}</h4>
                  <p className="hint">{tx.hospitalId?.city || 'No city'} · {tx.status}</p>
                  <p className="hint">
                    {tx.status === 'Completed'
                      ? 'Donation completed.'
                      : tx.status === 'Accepted'
                        ? 'You accepted this request.'
                        : tx.status === 'Cancelled'
                          ? 'You rejected this request.'
                          : 'Waiting for your decision.'}
                  </p>
                </div>
                <div className="inventory-row__contact">
                  <p className="inventory-row__contact-label">Timeline</p>
                  <p>{new Date(tx.createdAt).toLocaleString()}</p>
                  <p className="hint">{tx.hospitalId?.email || 'On file'}</p>
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

export default DonorLogs;
