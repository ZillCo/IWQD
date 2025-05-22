const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// Load environment variables
const MONGO_URL = process.env.MONGO_URL;
const BLYNK_TOKEN = process.env.BLYNK_TOKEN;
const BLYNK_API = 'https://blynk.cloud/external/api';

// Connect to MongoDB
mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Models
const SensorData = mongoose.model('SensorData', {
  user: String,
  pH: Number,
  temperature: Number,
  turbidity: Number,
  tds: Number,
  pin: String,
  timestamp: Date
});

const User = mongoose.model('User', {
  name: String,
  email: String,
  picture: String
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';

  try {
    const response = await axios.get(`${BLYNK_API}/get?token=${BLYNK_TOKEN}&${pin}`);
    const value = response.data;

    await SensorData.create({ user, pin, value, timestamp: new Date() });

    res.json({ value, user, pin, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get or save sensor data', detail: err.message });
  }
});

app.get('/api/latest-data', async (req, res) => {
  const latest = await SensorData.findOne().sort({ timestamp: -1 });
  if (!latest) return res.status(404).json({ message: 'No data' });

  const isSafe =
    latest.pH >= 6.5 && latest.pH <= 8.5 &&
    latest.temperature >= 20 && latest.temperature <= 35 &&
    latest.turbidity <= 5 &&
    latest.tds <= 500;

  res.json({
    ...latest.toObject(),
    status: isSafe ? 'Safe' : 'Unsafe'
  });
});

app.post('/auth/google', async (req, res) => {
  const { name, email, picture } = req.body;

  if (!email) return res.status(400).json({ message: 'Missing email' });

  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name, email, picture });

  res.json({ message: 'Login successful', user });
});

app.get('/api/history', async (req, res) => {
  const user = req.query.user || 'default';
  const history = await SensorData.find({ user }).sort({ timestamp: -1 }).limit(100);
  res.json(history);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
