require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: false },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['Individual donor', 'Hospital'] },
  organization: { type: String, required: false },
  hospitalAccess: { type: Boolean, default: false },
  bloodGroup: { type: String, required: false },
  gender: { type: String, required: false },
  birthdate: { type: Date, required: false },
  city: { type: String, required: false },
  location: {
    lat: { type: Number, required: false },
    lng: { type: Number, required: false }
  },
  isReadyToDonate: { type: Boolean, default: false },
  emergencyContact: { type: Boolean, default: false }
});

const bloodTransferSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['In Progress', 'Completed', 'Cancelled'], default: 'In Progress' },
  createdAt: { type: Date, default: Date.now }
});

const emergencyRequestSchema = new mongoose.Schema({
  bloodType: { type: String, required: true },
  units: { type: Number, required: true },
  city: { type: String, default: '' },
  urgency: { type: String, default: 'Critical' },
  clinicalReason: { type: String, default: '' },
  requestedBy: { type: String, default: 'Hospital' },
  contact: { type: String, default: '' },
  totalMatches: { type: Number, default: 0 },
  notifiedCount: { type: Number, default: 0 },
  notifiedDonors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const BloodTransfer = mongoose.models.BloodTransfer || mongoose.model('BloodTransfer', bloodTransferSchema);
const EmergencyRequest = mongoose.models.EmergencyRequest || mongoose.model('EmergencyRequest', emergencyRequestSchema);

const demoPassword = 'Demo@123';

const donorSeed = [
  {
    name: 'Aarav Shah',
    email: 'aarav.donor@example.com',
    role: 'Individual donor',
    bloodGroup: 'O+',
    gender: 'Male',
    birthdate: new Date('1998-06-14'),
    city: 'Mumbai',
    location: { lat: 19.076, lng: 72.8777 },
    isReadyToDonate: true,
    emergencyContact: true,
  },
  {
    name: 'Sara Khan',
    email: 'sara.donor@example.com',
    role: 'Individual donor',
    bloodGroup: 'B+',
    gender: 'Female',
    birthdate: new Date('1997-02-20'),
    city: 'Mumbai',
    location: { lat: 19.0896, lng: 72.8656 },
    isReadyToDonate: true,
    emergencyContact: true,
  },
  {
    name: 'Neha Patil',
    email: 'neha.donor@example.com',
    role: 'Individual donor',
    bloodGroup: 'A-',
    gender: 'Female',
    birthdate: new Date('1995-11-05'),
    city: 'Thane',
    location: { lat: 19.2183, lng: 72.9781 },
    isReadyToDonate: false,
    emergencyContact: true,
  },
  {
    name: 'Rohan Mehta',
    email: 'rohan.donor@example.com',
    role: 'Individual donor',
    bloodGroup: 'O-',
    gender: 'Male',
    birthdate: new Date('1993-09-17'),
    city: 'Navi Mumbai',
    location: { lat: 19.033, lng: 73.0297 },
    isReadyToDonate: true,
    emergencyContact: false,
  }
];

const hospitalSeed = [
  {
    email: 'citycare.hospital@example.com',
    role: 'Hospital',
    organization: 'CityCare Hospital',
    hospitalAccess: true,
    city: 'Mumbai',
    location: { lat: 19.0728, lng: 72.8826 },
  },
  {
    email: 'lifeline.hospital@example.com',
    role: 'Hospital',
    organization: 'Lifeline Medical Center',
    hospitalAccess: true,
    city: 'Thane',
    location: { lat: 19.2006, lng: 72.9722 },
  }
];

async function upsertUser(user, hashedPassword) {
  const payload = {
    password: hashedPassword,
    name: user.role === 'Individual donor' ? user.name : '',
    email: user.email,
    role: user.role,
    organization: user.role === 'Hospital' ? user.organization : '',
    hospitalAccess: user.role === 'Hospital',
    bloodGroup: user.role === 'Individual donor' ? user.bloodGroup : '',
    gender: user.role === 'Individual donor' ? user.gender : '',
    birthdate: user.role === 'Individual donor' ? user.birthdate : null,
    city: user.city,
    location: user.location,
    isReadyToDonate: user.isReadyToDonate ?? false,
    emergencyContact: user.emergencyContact ?? false,
  };

  return User.findOneAndUpdate(
    { email: user.email },
    payload,
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

async function seed() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const hashedPassword = await bcrypt.hash(demoPassword, 10);

  const donors = [];
  for (const donor of donorSeed) {
    donors.push(await upsertUser(donor, hashedPassword));
  }

  const hospitals = [];
  for (const hospital of hospitalSeed) {
    hospitals.push(await upsertUser(hospital, hashedPassword));
  }

  await EmergencyRequest.deleteMany({
    requestedBy: { $in: hospitalSeed.map((hospital) => hospital.organization) }
  });

  await BloodTransfer.deleteMany({
    hospitalId: { $in: hospitals.map((hospital) => hospital._id) }
  });

  const emergencyMatches = donors.filter(
    (donor) => donor.bloodGroup === 'B+' && donor.emergencyContact
  );

  await EmergencyRequest.create({
    bloodType: 'B+',
    units: 1,
    city: 'Mumbai',
    urgency: 'Critical',
    clinicalReason: 'Road accident emergency',
    requestedBy: hospitals[0].organization,
    contact: hospitals[0].email,
    totalMatches: emergencyMatches.length,
    notifiedCount: 0,
    notifiedDonors: emergencyMatches.map((donor) => donor._id),
  });

  await BloodTransfer.create({
    donorId: donors[0]._id,
    hospitalId: hospitals[0]._id,
    status: 'In Progress',
  });

  console.log('Demo data seeded successfully.');
  console.log(`Demo login password for all seeded users: ${demoPassword}`);
  console.log(`Seeded donors: ${donors.length}`);
  console.log(`Seeded hospitals: ${hospitals.length}`);

  await mongoose.disconnect();
}

seed()
  .catch(async (error) => {
    console.error('Failed to seed demo data:', error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore disconnect failures on error path
    }
    process.exit(1);
  });
