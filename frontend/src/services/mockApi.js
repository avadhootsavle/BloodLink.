const STORAGE_KEY = 'lifeline-blood-center';
const SESSION_KEY = `${STORAGE_KEY}-session`;
const DONATION_LOCK_KEY = `${STORAGE_KEY}-donated`;
const API_BASE = process.env.REACT_APP_API_BASE || '/api';

// Empty seed so we never auto-populate demo rows; data must come from API or user input.
const seedData = {
  inventory: [],
  requests: [],
  hospitals: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const writeStore = (store) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  return store;
};

const readDonationLocks = () => {
  const raw = localStorage.getItem(DONATION_LOCK_KEY);
  return raw ? JSON.parse(raw) : {};
};


const readStore = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  // No seed fallback; start empty so data always comes from the API or user input.
  return clone(seedData);
};

export const bootstrapStore = () => {
  const store = readStore();
  return store;
};

export const syncFromBackend = async () => {
  try {
    const res = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    writeStore({
      inventory: data.inventory || [],
      requests: data.requests || [],
      hospitals: data.hospitals || [],
    });
    return data;
  } catch (err) {
    return null;
  }
};

export const getInventory = () => readStore().inventory;

export const getRequests = () => readStore().requests;

export const getHospitals = () => readStore().hospitals;

export const getSession = () => {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const hasDonated = (session) => {
  const locks = readDonationLocks();
  const donorId = session?.id || 'guest';
  return Boolean(locks[donorId]);
};

export const loginUser = async (credentials) => {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Login failed');
  }
  const data = await res.json();
  localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
  return data.user;
};

export const signupUser = async (payload) => {
  const res = await fetch(`${API_BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Signup failed');
  }
  const data = await res.json();
  localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
  return data.user;
};

export const isCompatible = (available, needed) => {
  const compatibility = {
    'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    'O+': ['O+', 'A+', 'B+', 'AB+'],
    'A-': ['A-', 'A+', 'AB-', 'AB+'],
    'A+': ['A+', 'AB+'],
    'B-': ['B-', 'B+', 'AB-', 'AB+'],
    'B+': ['B+', 'AB+'],
    'AB-': ['AB-', 'AB+'],
    'AB+': ['AB+'],
  };

  return compatibility[available]?.includes(needed) ?? false;
};

export const updateDonorStatus = async (payload, actor) => {

  const res = await fetch(`${API_BASE}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) throw new Error('Failed to update status');
  const data = await res.json();
  
  // Persist updated user session gracefully if provided
  if (data.user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    window.dispatchEvent(new Event('storage'));
  }

  return data; // { inventory, user }
};

export const consumeDonation = async (id, hospitalId) => {
  const res = await fetch(`${API_BASE}/inventory/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, hospitalId }),
  });
  if (!res.ok) throw new Error('Failed to consume unit');
  return res.json();
};

export const addRequest = async (payload, actor) => {
  const store = readStore();
  const record = {
    id: `req-${Date.now()}`,
    bloodType: payload.bloodType,
    units: Number(payload.units),
    city: payload.city,
    urgency: payload.urgency,
    clinicalReason: payload.clinicalReason,
    requestedBy: payload.requestedBy || actor?.organization || actor?.name || 'Hospital team',
    contact: payload.contact || actor?.email || 'Verified contact',
    createdAt: new Date().toISOString(),
  };

  store.requests = [record, ...store.requests].slice(0, 50);
  writeStore(store);
  const res = await fetch(`${API_BASE}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    const error = await res.json().catch(async () => ({ message: await res.text() }));
    throw new Error(error.message || 'Failed to create emergency request');
  }

  const data = await res.json();
  const serverRecord = data.request
    ? {
        ...record,
        id: data.request._id || record.id,
        createdAt: data.request.createdAt || record.createdAt,
      }
    : record;

  const updatedRequests = [serverRecord, ...store.requests.filter((item) => item.id !== record.id)].slice(0, 50);
  writeStore({ ...store, requests: updatedRequests });

  return {
    requests: updatedRequests,
    record: serverRecord,
    totalMatches: data.totalMatches || 0,
    notifiedCount: data.notifiedCount || 0,
    preview: data.preview || [],
    emailEnabled: data.emailEnabled,
    emailErrors: data.emailErrors || [],
  };
};

export const findMatches = (neededType) => {
  const store = readStore();
  return store.inventory.filter((item) => isCompatible(item.bloodType, neededType));
};

export const findHospitalsByType = (neededType) => {
  const store = readStore();
  if (!neededType) return store.hospitals || [];
  return (store.hospitals || []).filter((hospital) =>
    hospital.readyTypes?.some((type) => isCompatible(type, neededType)),
  );
};
