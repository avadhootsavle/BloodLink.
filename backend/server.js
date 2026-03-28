const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
    // Fallbacks for arrays that are not fully migrated yet
    res.json({ inventory, requests: [], hospitals: [] });
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

app.post('/api/requests', (req, res) => {
  res.status(201).json({ message: 'Database connection pending for requests' });
});

app.post('/api/inventory/consume', async (req, res) => {
  try {
    const { id: donorId, hospitalId } = req.body;
    
    // Mark donor as no longer ready
    await User.findByIdAndUpdate(donorId, { isReadyToDonate: false });
    
    // Create the transfer record mapping the hospital to the donor
    if (hospitalId) {
      const transfer = new BloodTransfer({
        donorId,
        hospitalId,
        status: 'In Progress'
      });
      await transfer.save();
    }
    
    // Return updated inventory
    const inventory = await getInventory();
    res.json({ inventory });
  } catch (err) {
    console.error('Consume error:', err);
    res.status(500).json({ message: 'Error consuming unit' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`API running at http://${HOST}:${PORT}`);
});
