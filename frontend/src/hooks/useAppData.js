import { useEffect, useState } from 'react';
import { bootstrapStore, getHospitals, getSession, syncFromBackend } from '../services/mockApi';

export default function useAppData() {
  const [session, setSession] = useState(() => getSession());
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);

  useEffect(() => {
    const load = async () => {
      const remote = await syncFromBackend();
      if (remote) {
        setInventory(remote.inventory || []);
        setRequests(remote.requests || []);
        setHospitals(remote.hospitals || getHospitals());
        return;
      }
      const seeded = bootstrapStore();
      setInventory(seeded.inventory || []);
      setRequests(seeded.requests || []);
      setHospitals(seeded.hospitals || getHospitals());
    };
    load();
  }, []);

  useEffect(() => {
    const handleStorage = () => setSession(getSession());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return {
    session,
    inventory,
    requests,
    hospitals,
    setInventory,
    setRequests,
  };
}
