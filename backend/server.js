const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

const signupOtpStore = new Map();
const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000;
const DONATION_COOLDOWN_DAYS = 90;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: false },
  email: { type: String, required: true, unique: true },
  contactNumber: { type: String, required: false },
  profilePhoto: { type: String, required: false },
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
  emergencyContact: { type: Boolean, default: false },
  lastDonationAt: { type: Date, required: false },
  nextEligibleDonationAt: { type: Date, required: false },
});

const User = mongoose.model('User', userSchema);

// Blood Transfer Schema
const bloodTransferSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['In Progress', 'Accepted', 'Completed', 'Cancelled'], default: 'In Progress' },
  createdAt: { type: Date, default: Date.now }
});

const BloodTransfer = mongoose.model('BloodTransfer', bloodTransferSchema);

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

const EmergencyRequest = mongoose.model('EmergencyRequest', emergencyRequestSchema);

const bloodCompatibility = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

const isCompatible = (available, needed) => bloodCompatibility[available]?.includes(needed) ?? false;

const getMailer = () => {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) return null;

  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: Number(EMAIL_PORT) === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
};

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  contactNumber: user.contactNumber,
  profilePhoto: user.profilePhoto || '',
  role: user.role,
  organization: user.organization,
  hospitalAccess: user.hospitalAccess,
  bloodGroup: user.bloodGroup,
  gender: user.gender,
  birthdate: user.birthdate,
  city: user.city,
  location: user.location,
  isReadyToDonate: user.isReadyToDonate,
  emergencyContact: user.emergencyContact,
  lastDonationAt: user.lastDonationAt,
  nextEligibleDonationAt: user.nextEligibleDonationAt,
});

const calculateNextEligibleDonationDate = (fromDate = new Date()) => {
  const nextDate = new Date(fromDate);
  nextDate.setDate(nextDate.getDate() + DONATION_COOLDOWN_DAYS);
  return nextDate;
};

const isDonorInCooldown = (user) => {
  if (!user?.nextEligibleDonationAt) return false;
  return new Date(user.nextEligibleDonationAt).getTime() > Date.now();
};

const validateSignupPayload = async (payload) => {
  const { name, email, password, role, organization, bloodGroup, gender, birthdate, city, location, contactNumber } = payload;

  if (!email || !password || !role || !city || !contactNumber) {
    return 'Missing required signup fields.';
  }

  if (role === 'Individual donor') {
    if (!name || !bloodGroup || !gender || !birthdate) {
      return 'Missing donor signup fields.';
    }

    const dob = new Date(birthdate);
    let calcAge = new Date().getFullYear() - dob.getFullYear();
    const m = new Date().getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) {
      calcAge--;
    }
    if (calcAge < 18 || calcAge > 65) {
      return 'Donor age must be between 18 and 65 years.';
    }
  }

  if (role === 'Hospital' && !organization) {
    return 'Hospital name is required.';
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return 'User already exists with this email.';
  }

  return null;
};

const makeSignupUser = async (payload) => {
  const { name, email, contactNumber, password, role, organization, bloodGroup, gender, birthdate, city, location } = payload;
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newUser = new User({
    name: role === 'Individual donor' ? name : '',
    email,
    contactNumber,
    password: hashedPassword,
    role,
    organization: role === 'Hospital' ? organization : '',
    hospitalAccess: role === 'Hospital',
    bloodGroup: role === 'Individual donor' ? bloodGroup : '',
    gender: role === 'Individual donor' ? gender : '',
    birthdate: role === 'Individual donor' ? new Date(birthdate) : null,
    city,
    location
  });

  return newUser.save();
};

const buildSignupOtpEmail = ({ otp, role }) => ({
  subject: 'BloodLink verification code',
  text: [
    'BloodLink verification code',
    '',
    `Code: ${otp}`,
    '',
    `Use this code to complete your ${role === 'Hospital' ? 'hospital' : 'donor'} signup.`,
    'This code expires in 10 minutes.',
  ].join('\n'),
  html: buildEmailLayout({
    eyebrow: 'Email Verification',
    title: 'Confirm your email address',
    intro: `Use the verification code below to complete your ${role === 'Hospital' ? 'hospital' : 'donor'} signup.`,
    accentBlock: `
      <div style="margin: 28px 0; padding: 22px; border-radius: 20px; background: linear-gradient(135deg, #fff3ef, #fff9f7); border: 1px solid #ffd7cb; text-align: center;">
        <div style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #a05243; font-weight: 700;">Verification Code</div>
        <div style="margin-top: 10px; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #b3202a;">${otp}</div>
      </div>
    `,
    details: [
      ['Purpose', `${role === 'Hospital' ? 'Hospital' : 'Donor'} signup verification`],
      ['Validity', '10 minutes'],
      ['Security', 'Do not share this code with anyone'],
    ],
    closing: 'If you did not request this signup, you can ignore this email.',
  }),
});

const calculateAge = (birthdate) => {
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

const buildDonorBadgeSummary = async (userId) => {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

  const [completedAllTime, completedThisYear] = await Promise.all([
    BloodTransfer.countDocuments({ donorId: userId, status: 'Completed' }),
    BloodTransfer.countDocuments({
      donorId: userId,
      status: 'Completed',
      createdAt: { $gte: yearStart, $lt: yearEnd },
    }),
  ]);

  const badgeCatalog = [
    {
      id: 'first-drop',
      name: 'First Drop',
      tier: 'Bronze',
      headline: 'Completed your first life-saving donation',
      description: 'Awarded when a donor completes their first verified blood donation through BloodLink.',
      color: '#c97a3d',
      unlocked: completedAllTime >= 1,
    },
    {
      id: 'rapid-responder',
      name: 'Rapid Responder',
      tier: 'Silver',
      headline: 'Three completed donations in one year',
      description: 'Awarded to donors who complete at least three verified donations in the current year.',
      color: '#8290a3',
      unlocked: completedThisYear >= 3,
    },
    {
      id: 'lifeline-hero',
      name: 'Lifeline Hero',
      tier: 'Gold',
      headline: 'Five lifetime completed donations',
      description: 'Awarded when a donor reaches five completed donations overall.',
      color: '#d4a63f',
      unlocked: completedAllTime >= 5,
    },
  ];

  return {
    completedAllTime,
    completedThisYear,
    unlockedCount: badgeCatalog.filter((badge) => badge.unlocked).length,
    badges: badgeCatalog,
  };
};

const buildEmailLayout = ({ eyebrow, title, intro, accentBlock = '', details = [], closing = '' }) => {
  const detailsHtml = details.length
    ? `
      <div style="margin-top: 24px; border: 1px solid #f0ddd5; border-radius: 18px; overflow: hidden;">
        ${details.map(([label, value], index) => `
          <div style="display: grid; grid-template-columns: 150px 1fr; gap: 16px; padding: 14px 18px; background: ${index % 2 === 0 ? '#fffaf8' : '#ffffff'};">
            <div style="font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #9a6b60;">${label}</div>
            <div style="font-size: 15px; color: #2a1c1c;">${value}</div>
          </div>
        `).join('')}
      </div>
    `
    : '';

  return `
    <div style="margin: 0; padding: 32px 16px; background: #f6efea; font-family: Arial, sans-serif; color: #241717;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 28px; overflow: hidden; box-shadow: 0 18px 44px rgba(49, 24, 21, 0.08);">
        <div style="padding: 28px 32px; background: linear-gradient(135deg, #251213, #3b1919 55%, #4a1b1b); color: #fff4ef;">
          <div style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #ffb49c; font-weight: 700;">${eyebrow}</div>
          <div style="margin-top: 10px; font-size: 30px; line-height: 1.15; font-weight: 700;">${title}</div>
          <div style="margin-top: 12px; font-size: 15px; line-height: 1.7; color: rgba(255, 235, 227, 0.82);">${intro}</div>
        </div>
        <div style="padding: 30px 32px;">
          ${accentBlock}
          ${detailsHtml}
          ${closing ? `<p style="margin: 24px 0 0; color: #6f5a57; line-height: 1.7;">${closing}</p>` : ''}
        </div>
        <div style="padding: 18px 32px 28px; color: #8a7470; font-size: 13px;">
          <div style="font-weight: 700; color: #b3202a; margin-bottom: 4px;">BloodLink</div>
          <div>Coordinating donors and hospitals when response time matters.</div>
        </div>
      </div>
    </div>
  `;
};

const buildEmergencyEmail = ({ donor, request }) => {
  const subject = `Emergency blood request: ${request.bloodType} needed`;
  const fromLine = request.requestedBy || 'Hospital';
  const cityLine = request.city || 'your area';
  const contactLine = request.contact || 'Contact available in BloodLink';
  const reasonLine = request.clinicalReason || 'Emergency blood requirement';

  return {
    subject,
    text: [
      `Hello ${donor.name || 'Donor'},`,
      '',
      `A hospital has raised an emergency request for ${request.bloodType} blood in ${cityLine}.`,
      `Units needed: ${request.units}.`,
      `Requested by: ${fromLine}.`,
      `Reason: ${reasonLine}.`,
      `Callback contact: ${contactLine}.`,
      '',
      'If you are available to donate, please respond as soon as possible.',
      '',
      'BloodLink',
    ].join('\n'),
    html: buildEmailLayout({
      eyebrow: 'Emergency Request',
      title: `${request.bloodType} blood is urgently needed`,
      intro: `Hello ${donor.name || 'Donor'}, a hospital has raised an emergency request near ${cityLine}.`,
      accentBlock: `
        <div style="padding: 20px 22px; border-radius: 20px; background: linear-gradient(135deg, #fff3ef, #fff9f7); border: 1px solid #ffd7cb;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #a05243; font-weight: 700;">Immediate Action</div>
          <div style="margin-top: 10px; font-size: 24px; font-weight: 800; color: #b3202a;">Please respond as soon as possible</div>
        </div>
      `,
      details: [
        ['Blood Type', request.bloodType],
        ['Units Needed', String(request.units)],
        ['Requested By', fromLine],
        ['Location', cityLine],
        ['Reason', reasonLine],
        ['Contact', contactLine],
      ],
      closing: 'If you are available to donate, please log in to BloodLink and respond immediately.',
    }),
  };
};

const buildTransferRequestEmail = ({ donor, hospital }) => ({
  subject: `Blood required by ${hospital?.organization || 'a hospital'}`,
  text: [
    `Hello ${donor.name || 'Donor'},`,
    '',
    `${hospital?.organization || 'A hospital'} has requested your blood donation.`,
    `Blood type required: ${donor.bloodGroup || 'Your registered group'}.`,
    `Hospital city: ${hospital?.city || 'Not provided'}.`,
    `Hospital contact: ${hospital?.email || 'Available in BloodLink'}.`,
    '',
    'Please log in to BloodLink and accept or reject the request.',
    '',
    'BloodLink',
  ].join('\n'),
  html: buildEmailLayout({
    eyebrow: 'Donation Request',
    title: `${hospital?.organization || 'A hospital'} has requested your donation`,
    intro: `Hello ${donor.name || 'Donor'}, your blood profile matches an active hospital need.`,
    accentBlock: `
      <div style="padding: 20px 22px; border-radius: 20px; background: linear-gradient(135deg, #fff4ef, #fffaf7); border: 1px solid #ffdccc;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #a05243; font-weight: 700;">Next Step</div>
        <div style="margin-top: 10px; font-size: 22px; font-weight: 800; color: #b3202a;">Log in and accept or reject the request</div>
      </div>
    `,
    details: [
      ['Hospital', hospital?.organization || 'Verified hospital'],
      ['Blood Type', donor.bloodGroup || 'Your registered group'],
      ['Hospital City', hospital?.city || 'Not provided'],
      ['Hospital Contact', hospital?.email || 'Available in BloodLink'],
    ],
    closing: 'If you accept, the hospital can then call you to schedule the appointment.',
  }),
});

const buildTransferDecisionEmail = ({ donor, hospital, decision }) => {
  const accepted = decision === 'Accepted';
  return {
    subject: accepted
      ? `${donor?.name || 'A donor'} accepted your blood request`
      : `${donor?.name || 'A donor'} rejected your blood request`,
    text: [
      `Hello ${hospital?.organization || hospital?.name || 'Hospital'},`,
      '',
      `${donor?.name || 'The donor'} has ${accepted ? 'accepted' : 'rejected'} your blood donation request.`,
      `Blood type: ${donor?.bloodGroup || 'Not provided'}.`,
      `Donor city: ${donor?.city || 'Not provided'}.`,
      `Donor contact: ${donor?.contactNumber || donor?.email || 'Not provided'}.`,
      '',
      accepted
        ? 'You can now call the donor and schedule the appointment.'
        : 'Please search for another donor if the requirement is still active.',
      '',
      'BloodLink',
    ].join('\n'),
    html: buildEmailLayout({
      eyebrow: accepted ? 'Request Accepted' : 'Request Rejected',
      title: accepted
        ? `${donor?.name || 'A donor'} accepted your request`
        : `${donor?.name || 'A donor'} rejected your request`,
      intro: accepted
        ? 'The donor is ready to proceed. You can now call and schedule the appointment.'
        : 'The donor declined this request. You may need to contact another donor.',
      accentBlock: `
        <div style="padding: 20px 22px; border-radius: 20px; background: ${accepted ? 'linear-gradient(135deg, #eefaf4, #f8fffb)' : 'linear-gradient(135deg, #fff4f2, #fff9f8)'}; border: 1px solid ${accepted ? '#cfe9da' : '#ffd7cb'};">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accepted ? '#37735d' : '#a05243'}; font-weight: 700;">Donor Decision</div>
          <div style="margin-top: 10px; font-size: 24px; font-weight: 800; color: ${accepted ? '#237a58' : '#b3202a'};">${accepted ? 'Accepted' : 'Rejected'}</div>
        </div>
      `,
      details: [
        ['Donor Name', donor?.name || 'Not provided'],
        ['Blood Type', donor?.bloodGroup || 'Not provided'],
        ['City', donor?.city || 'Not provided'],
        ['Phone', donor?.contactNumber || 'Not provided'],
        ['Email', donor?.email || 'Not provided'],
      ],
      closing: accepted
        ? 'Please contact the donor to confirm the appointment details.'
        : 'Please continue coordination through BloodLink if you still need a donation match.',
    }),
  };
};

// Routes
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: buildUserResponse(user) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user' });
  }
});

app.patch('/api/user/:id/profile-photo', async (req, res) => {
  try {
    const { profilePhoto } = req.body;
    if (!profilePhoto) {
      return res.status(400).json({ message: 'Profile photo is required.' });
    }

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (existingUser.profilePhoto) {
      return res.status(400).json({ message: 'Profile photo is already set and cannot be changed.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { profilePhoto },
      { new: true, returnDocument: 'after' }
    );

    res.json({ user: buildUserResponse(user), message: 'Profile photo updated.' });
  } catch (error) {
    console.error('Profile photo update error:', error);
    res.status(500).json({ message: 'Failed to update profile photo.' });
  }
});

app.get('/api/donors/:id/badges', async (req, res) => {
  try {
    const donor = await User.findById(req.params.id);
    if (!donor) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (donor.role !== 'Individual donor') {
      return res.status(400).json({ message: 'Badges are available only for donors.' });
    }

    const summary = await buildDonorBadgeSummary(donor._id);
    res.json({
      donor: {
        id: donor._id,
        name: donor.name,
        bloodGroup: donor.bloodGroup,
      },
      ...summary,
    });
  } catch (error) {
    console.error('Badge summary error:', error);
    res.status(500).json({ message: 'Failed to fetch donor badges.' });
  }
});

app.post('/api/signup/request-otp', async (req, res) => {
  try {
    const validationError = await validateSignupPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const mailer = getMailer();
    if (!mailer) {
      return res.status(500).json({ message: 'Email verification is not configured yet.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    signupOtpStore.set(req.body.email, {
      otp,
      payload: req.body,
      expiresAt: Date.now() + SIGNUP_OTP_TTL_MS,
    });

    const message = buildSignupOtpEmail({ otp, role: req.body.role });
    await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: req.body.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    res.json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Signup OTP request error:', error);
    res.status(500).json({ message: 'Failed to send verification code.' });
  }
});

app.post('/api/signup/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const pending = signupOtpStore.get(email);

    if (!pending) {
      return res.status(400).json({ message: 'No verification code found for this email. Request a new one.' });
    }

    if (pending.expiresAt < Date.now()) {
      signupOtpStore.delete(email);
      return res.status(400).json({ message: 'Verification code expired. Request a new one.' });
    }

    if (pending.otp !== String(otp || '')) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    const validationError = await validateSignupPayload(pending.payload);
    if (validationError) {
      signupOtpStore.delete(email);
      return res.status(400).json({ message: validationError });
    }

    const savedUser = await makeSignupUser(pending.payload);
    signupOtpStore.delete(email);

    res.status(201).json({
      user: buildUserResponse(savedUser),
      message: 'Signup successful!',
    });
  } catch (error) {
    console.error('Signup OTP verify error:', error);
    res.status(500).json({ message: 'Failed to verify signup code.' });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const validationError = await validateSignupPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const savedUser = await makeSignupUser(req.body);
    res.status(201).json({ user: buildUserResponse(savedUser), message: 'Signup successful!' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    res.status(200).json({ user: buildUserResponse(user), message: 'Login successful!' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

const getInventory = async () => {
  const readyDonors = await User.find({
    isReadyToDonate: true,
    role: 'Individual donor',
    $or: [
      { nextEligibleDonationAt: { $exists: false } },
      { nextEligibleDonationAt: null },
      { nextEligibleDonationAt: { $lte: new Date() } },
    ],
  });
  return readyDonors.map(user => ({
    id: user._id,
    bloodType: user.bloodGroup,
    units: 1,
    city: user.city,
    location: user.location,
    donorId: user._id,
    donorName: user.name,
    age: calculateAge(user.birthdate),
    contactNumber: user.contactNumber || '',
    email: user.email || '',
    address: user.city,
    hospital: user.name || 'Verified donor',
    status: 'Ready',
    lastDonationAt: user.lastDonationAt,
    nextEligibleDonationAt: user.nextEligibleDonationAt,
  }));
};

// App State endpoints (pending complete MongoDB migration)
app.get('/api/state', async (req, res) => {
  try {
    const inventory = await getInventory();
    const requests = await EmergencyRequest.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const activeTransfers = await BloodTransfer.countDocuments({ status: { $in: ['In Progress', 'Accepted'] } });
    const hospitalCount = await User.countDocuments({ role: 'Hospital' });
    res.json({ inventory, requests, hospitals: [], activeTransfers, hospitalCount });
  } catch (err) {
    console.error('State error:', err);
    res.status(500).json({ message: 'Database connection error' });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { donorId, city, isReadyToDonate, emergencyContact } = req.body;
    let updatedUser = null;
    
    if (donorId) {
      const existingUser = await User.findById(donorId);
      if (!existingUser) {
        return res.status(404).json({ message: 'Donor not found.' });
      }

      if (typeof isReadyToDonate === 'boolean' && isReadyToDonate && isDonorInCooldown(existingUser)) {
        return res.status(400).json({
          message: `You are in the donation cooldown period. You can donate again after ${new Date(existingUser.nextEligibleDonationAt).toLocaleDateString()}.`,
          user: buildUserResponse(existingUser),
        });
      }

      const updateData = {};
      if (typeof isReadyToDonate === 'boolean') updateData.isReadyToDonate = isReadyToDonate;
      if (typeof emergencyContact === 'boolean') updateData.emergencyContact = emergencyContact;
      if (city) updateData.city = city;
      
      updatedUser = await User.findByIdAndUpdate(donorId, updateData, { new: true });
    }
    
    const inventory = await getInventory();
    
    // Map back the new user fields so the frontend immediately reflects it without re-logging in
    const userResponse = updatedUser ? buildUserResponse(updatedUser) : null;

    res.status(201).json({ inventory, user: userResponse });
  } catch (error) {
    console.error('Inventory error:', error);
    res.status(500).json({ message: 'Error saving donation state' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = {
      bloodType: req.body.bloodType,
      units: 1,
      city: '',
      urgency: req.body.urgency || 'Critical',
      clinicalReason: req.body.clinicalReason || '',
      requestedBy: req.body.requestedBy || 'Hospital',
      contact: req.body.contact || '',
    };

    if (!request.bloodType) {
      return res.status(400).json({ message: 'Blood type is required.' });
    }

    // Find all emergency donors with the exact same blood group
    const matches = await User.find({
      role: 'Individual donor',
      emergencyContact: true,
      bloodGroup: request.bloodType,
      email: { $exists: true, $ne: '' },
    });

    const savedRequest = await EmergencyRequest.create({
      ...request,
      totalMatches: matches.length,
      notifiedDonors: matches.map((donor) => donor._id),
    });

    const mailer = getMailer();
    let notifiedCount = 0;
    let emailErrors = [];

    if (mailer && matches.length) {
      const sendResults = await Promise.allSettled(
        matches.map((donor) => {
          const message = buildEmergencyEmail({ donor, request });
          return mailer.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: donor.email,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });
        }),
      );

      notifiedCount = sendResults.filter((result) => result.status === 'fulfilled').length;
      emailErrors = sendResults
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Unknown email error');
    }

    savedRequest.notifiedCount = notifiedCount;
    await savedRequest.save();

    const preview = matches.slice(0, 5).map((donor) => ({
      id: donor._id,
      donorName: donor.name,
      bloodType: donor.bloodGroup,
      city: donor.city,
      email: donor.email,
    }));

    res.status(201).json({
      request: savedRequest,
      totalMatches: matches.length,
      notifiedCount,
      preview,
      emailEnabled: Boolean(mailer),
      emailErrors,
      message: matches.length
        ? 'Emergency request created and donors processed.'
        : 'Emergency request created, but no compatible ready donors were found.',
    });
  } catch (error) {
    console.error('Request error:', error);
    res.status(500).json({ message: 'Failed to create emergency request.' });
  }
});

app.post('/api/inventory/consume', async (req, res) => {
  try {
    const { id: donorId, hospitalId } = req.body;

    const donor = await User.findByIdAndUpdate(
      donorId,
      { isReadyToDonate: false },
      { new: true }
    );

    if (!donor) {
      return res.status(404).json({ message: 'Donor not found.' });
    }

    const hospital = hospitalId ? await User.findById(hospitalId) : null;

    // Create the transfer record mapping the hospital to the donor
    if (hospitalId) {
      const transfer = new BloodTransfer({
        donorId,
        hospitalId,
        status: 'In Progress'
      });
      await transfer.save();
    }

    let emailSent = false;
    let emailError = '';
    const mailer = getMailer();

    if (mailer && donor.email) {
      try {
        const message = buildTransferRequestEmail({ donor, hospital });
        await mailer.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: donor.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        emailSent = true;
      } catch (error) {
        emailError = error.message || 'Failed to send donor email';
        console.error('Consume email error:', error);
      }
    }

    // Return updated inventory
    const inventory = await getInventory();
    res.json({
      inventory,
      emailSent,
      emailError,
      donorEmail: donor.email || '',
      donorName: donor.name || 'Donor',
    });
  } catch (err) {
    console.error('Consume error:', err);
    res.status(500).json({ message: 'Error consuming unit' });
  }
});

app.get('/api/transfers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const transfers = await BloodTransfer.find({
      $or: [{ donorId: userId }, { hospitalId: userId }]
    })
    .populate('donorId', 'name email contactNumber bloodGroup city birthdate')
    .populate('hospitalId', 'organization name email city')
    .sort({ createdAt: -1 });
    
    res.json({ transfers });
  } catch (err) {
    console.error('Transfers fetch error:', err);
    res.status(500).json({ message: 'Error fetching transfers' });
  }
});

app.patch('/api/transfers/:id/complete', async (req, res) => {
  try {
    const completedAt = new Date();
    const nextEligibleDonationAt = calculateNextEligibleDonationDate(completedAt);

    const transfer = await BloodTransfer.findByIdAndUpdate(
      req.params.id,
      { status: 'Completed' },
      { returnDocument: 'after' }
    );
    if (!transfer) {
      return res.status(404).json({ message: 'Transfer not found.' });
    }

    const donor = await User.findByIdAndUpdate(
      transfer.donorId,
      {
        isReadyToDonate: false,
        lastDonationAt: completedAt,
        nextEligibleDonationAt,
      },
      { new: true }
    );

    res.json({
      transfer,
      donor: donor ? buildUserResponse(donor) : null,
      message: `Transfer marked as completed. Donor cooldown is active until ${nextEligibleDonationAt.toLocaleDateString()}.`,
    });
  } catch (err) {
    console.error('Complete transfer error:', err);
    res.status(500).json({ message: 'Error completing transfer' });
  }
});

app.patch('/api/transfers/:id/accept', async (req, res) => {
  try {
    const transfer = await BloodTransfer.findByIdAndUpdate(
      req.params.id,
      { status: 'Accepted' },
      { returnDocument: 'after' }
    )
      .populate('donorId', 'name email contactNumber bloodGroup city')
      .populate('hospitalId', 'organization name email city');
    if (!transfer) {
      return res.status(404).json({ message: 'Transfer not found.' });
    }

    let hospitalEmailSent = false;
    let hospitalEmailError = '';
    const mailer = getMailer();

    if (mailer && transfer.hospitalId?.email) {
      try {
        const message = buildTransferDecisionEmail({
          donor: transfer.donorId,
          hospital: transfer.hospitalId,
          decision: 'Accepted',
        });
        await mailer.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: transfer.hospitalId.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        hospitalEmailSent = true;
      } catch (error) {
        hospitalEmailError = error.message || 'Failed to send hospital acceptance email';
        console.error('Accept transfer email error:', error);
      }
    }

    res.json({
      transfer,
      hospitalEmailSent,
      hospitalEmailError,
      message: 'Transfer accepted. Hospital can contact the donor for appointment scheduling.',
    });
  } catch (err) {
    console.error('Accept transfer error:', err);
    res.status(500).json({ message: 'Error accepting transfer' });
  }
});

app.delete('/api/transfers/:id', async (req, res) => {
  try {
    const transfer = await BloodTransfer.findById(req.params.id)
      .populate('donorId', 'name email contactNumber bloodGroup city')
      .populate('hospitalId', 'organization name email city');
    if (!transfer) {
      return res.status(404).json({ message: 'Transfer not found.' });
    }

    let hospitalEmailSent = false;
    let hospitalEmailError = '';
    const mailer = getMailer();

    if (mailer && transfer.hospitalId?.email) {
      try {
        const message = buildTransferDecisionEmail({
          donor: transfer.donorId,
          hospital: transfer.hospitalId,
          decision: 'Rejected',
        });
        await mailer.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: transfer.hospitalId.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        hospitalEmailSent = true;
      } catch (error) {
        hospitalEmailError = error.message || 'Failed to send hospital rejection email';
        console.error('Reject transfer email error:', error);
      }
    }

    // Restore donor availability
    await User.findByIdAndUpdate(transfer.donorId, { isReadyToDonate: true });
    await BloodTransfer.findByIdAndUpdate(req.params.id, { status: 'Cancelled' });
    res.json({
      message: 'Transfer rejected and saved to history.',
      hospitalEmailSent,
      hospitalEmailError,
    });
  } catch (err) {
    console.error('Reject transfer error:', err);
    res.status(500).json({ message: 'Error rejecting transfer' });
  }
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Uploaded file is too large. Please use a smaller image.' });
  }

  if (err) {
    console.error('Unhandled server error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }

  next();
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`API running at http://${HOST}:${PORT}`);
  });
}

module.exports = app;
