const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
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

const User = mongoose.model('User', userSchema);

// Blood Transfer Schema
const bloodTransferSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['In Progress', 'Completed', 'Cancelled'], default: 'In Progress' },
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
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1f1f;">
        <p>Hello ${donor.name || 'Donor'},</p>
        <p>
          A hospital has raised an <strong>emergency request</strong> for
          <strong>${request.bloodType}</strong> blood in <strong>${cityLine}</strong>.
        </p>
        <p>
          <strong>Units needed:</strong> ${request.units}<br />
          <strong>Requested by:</strong> ${fromLine}<br />
          <strong>Reason:</strong> ${reasonLine}<br />
          <strong>Callback contact:</strong> ${contactLine}
        </p>
        <p>If you are available to donate, please respond as soon as possible.</p>
        <p>BloodLink</p>
      </div>
    `,
  };
};

// Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role, organization, bloodGroup, gender, birthdate, city, location } = req.body;
    
    if (role === 'Individual donor') {
      const dob = new Date(birthdate);
      let calcAge = new Date().getFullYear() - dob.getFullYear();
      const m = new Date().getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) {
        calcAge--;
      }
      if (calcAge < 18) {
        return res.status(400).json({ message: 'You must be at least 18 years old to sign up as a donor.' });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name: role === 'Individual donor' ? name : '',
      email,
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

    const savedUser = await newUser.save();
    
    // safe payload
    const userResponse = {
      id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      role: savedUser.role,
      organization: savedUser.organization,
      hospitalAccess: savedUser.hospitalAccess,
      bloodGroup: savedUser.bloodGroup,
      gender: savedUser.gender,
      birthdate: savedUser.birthdate,
      city: savedUser.city,
      location: savedUser.location,
      isReadyToDonate: savedUser.isReadyToDonate,
      emergencyContact: savedUser.emergencyContact
    };

    res.status(201).json({ user: userResponse, message: 'Signup successful!' });
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

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      hospitalAccess: user.hospitalAccess,
      bloodGroup: user.bloodGroup,
      gender: user.gender,
      birthdate: user.birthdate,
      city: user.city,
      location: user.location,
      isReadyToDonate: user.isReadyToDonate,
      emergencyContact: user.emergencyContact
    };

    res.status(200).json({ user: userResponse, message: 'Login successful!' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

const getInventory = async () => {
  const readyDonors = await User.find({ isReadyToDonate: true, role: 'Individual donor' });
  return readyDonors.map(user => ({
    id: user._id,
    bloodType: user.bloodGroup,
    units: 1,
    city: user.city,
    location: user.location,
    donorId: user._id,
    donorName: user.name,
    hospital: 'Verified donor',
    status: 'Ready'
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
    res.json({ inventory, requests, hospitals: [] });
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
      const updateData = {};
      if (typeof isReadyToDonate === 'boolean') updateData.isReadyToDonate = isReadyToDonate;
      if (typeof emergencyContact === 'boolean') updateData.emergencyContact = emergencyContact;
      if (city) updateData.city = city;
      
      updatedUser = await User.findByIdAndUpdate(donorId, updateData, { new: true });
    }
    
    const inventory = await getInventory();
    
    // Map back the new user fields so the frontend immediately reflects it without re-logging in
    const userResponse = updatedUser ? {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      organization: updatedUser.organization,
      hospitalAccess: updatedUser.hospitalAccess,
      bloodGroup: updatedUser.bloodGroup,
      gender: updatedUser.gender,
      birthdate: updatedUser.birthdate,
      city: updatedUser.city,
      location: updatedUser.location,
      isReadyToDonate: updatedUser.isReadyToDonate,
      emergencyContact: updatedUser.emergencyContact
    } : null;

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
      units: Number(req.body.units || 0),
      city: req.body.city || '',
      urgency: req.body.urgency || 'Critical',
      clinicalReason: req.body.clinicalReason || '',
      requestedBy: req.body.requestedBy || 'Hospital',
      contact: req.body.contact || '',
    };

    if (!request.bloodType || request.units < 1) {
      return res.status(400).json({ message: 'Blood type and units are required.' });
    }

    const candidateDonors = await User.find({
      role: 'Individual donor',
      isReadyToDonate: true,
      emergencyContact: true,
      email: { $exists: true, $ne: '' },
    });

    const matches = candidateDonors.filter((donor) => {
      const bloodMatch = isCompatible(donor.bloodGroup, request.bloodType);
      if (!bloodMatch) return false;
      if (!request.city) return true;
      return donor.city?.toLowerCase() === request.city.toLowerCase();
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
        await mailer.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: donor.email,
          subject: `Blood required by ${hospital?.organization || 'a hospital'}`,
          text: [
            `Hello ${donor.name || 'Donor'},`,
            '',
            `${hospital?.organization || 'A hospital'} has requested your blood donation.`,
            `Blood type required: ${donor.bloodGroup || 'Your registered group'}.`,
            `Hospital city: ${hospital?.city || 'Not provided'}.`,
            `Hospital contact: ${hospital?.email || 'Available in BloodLink'}.`,
            '',
            'Please log in to BloodLink and respond as soon as possible.',
            '',
            'BloodLink',
          ].join('\n'),
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1f1f;">
              <p>Hello ${donor.name || 'Donor'},</p>
              <p>
                <strong>${hospital?.organization || 'A hospital'}</strong> has requested your blood donation.
              </p>
              <p>
                <strong>Blood type required:</strong> ${donor.bloodGroup || 'Your registered group'}<br />
                <strong>Hospital city:</strong> ${hospital?.city || 'Not provided'}<br />
                <strong>Hospital contact:</strong> ${hospital?.email || 'Available in BloodLink'}
              </p>
              <p>Please log in to BloodLink and respond as soon as possible.</p>
              <p>BloodLink</p>
            </div>
          `,
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

app.listen(PORT, HOST, () => {
  console.log(`API running at http://${HOST}:${PORT}`);
});
