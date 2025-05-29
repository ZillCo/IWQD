require('dotenv').config(); // Load variables from .env

const express = require('express');
const app = express();
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');

const PORT = process.env.PORT;

// Load environment variables
const MONGO_URL = "mongodb+srv://josephmaglaque4:Mmaglaque22@cluster0.vy5rnw7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const BLYNK_TOKEN ="oVXe6YV3PrFqXQmtDg3H3eSPo2kgzJmc";
const BLYNK_API = 'https://blynk.cloud/external/api';

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.static("public"));// HTML is inside /public

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(cors({ origin: 'https://zillco.github.io', credentials: true }));

// Check env variables
if (!MONGO_URL || !BLYNK_TOKEN) {
  console.error('❌ Missing MONGO_URL or BLYNK_TOKEN in environment');
  process.exit(1);
}
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
  DO: Number,
  pin: String,
  timestamp: Date
});
 
// Root health check
app.get('/', (req, res) =>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Get latest from Blynk and save to DB
app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';

  try {
    const response = await axios.get(`${BLYNK_API}/get?token=${BLYNK_TOKEN}&${pin}`);
    const value = parseFloat(response.data); // for single pin reading like v1

    let sensorFields = {};
    // Map pin to correct sensor field
    switch (pin) {
      case 'v1': sensorFields.pH = value; break;
      case 'v2': sensorFields.temperature = value; break;
      case 'v3': sensorFields.turbidity = value; break;
      case 'v4': sensorFields.tds = value; break;
      case 'v5': sensorFields.DO = value; break;
      default: return res.status(400).json({ error: 'Unknown pin' });
    }
    
    const timestamp = new Date();
    await SensorData.create({ user, pin, ...sensorFields, timestamp });
    
    res.json({ user, pin, ...sensorFields, timestamp });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get or save sensor data', detail: err.message });
  }
});

// Get latest saved data from DB
app.get('/api/latest-data', async (req, res) => {
  const latest = await SensorData.findOne().sort({ timestamp: -1 });
  if (!latest) return res.status(404).json({ message: 'No data' });

  const isSafe =
    latest.pH >= 6.5 && latest.pH <= 8.5 &&
    latest.temperature >= 20 && latest.temperature <= 35 &&
    latest.turbidity <= 5 &&
    latest.tds <= 500 &&
    latest.DO >= 6.5 && latest.DO <= 8.5;

  res.json({ ...latest.toObject(), status: isSafe ? 'Safe' : 'Unsafe' });
});

// Manual sensor data post
app.post('/api/data', async (req, res) => {
  try {
    const { pH, temperature, turbidity, tds, DO } = req.body;

    if (!pH || !temperature || !turbidity || !tds || !DO) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    const newData = new SensorData({
      pH,
      temperature,
      turbidity,
      tds,
      DO,
      timestamp: new Date()
    });

    await newData.save();
    res.status(201).json({ message: 'Sensor data saved successfully' });
  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Get data history
app.get('/api/history', async (req, res) => {
  const user = req.query.user || 'default';
  const history = await SensorData.find({ user }).sort({ timestamp: -1 }).limit(100);
  res.json(history);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
