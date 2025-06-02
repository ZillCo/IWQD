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

// Middleware
app.use(express.static(path.join(__dirname, 'index.html')));
app.use(express.json());
app.use(express.static("index.html"));// HTML is inside /public

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(cors({ origin: 'https://zillco.github.io', credentials: true }));

// Check env variables
if (!MONGO_URL) {
  console.error('❌ Missing MONGO_URL in environment');
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
  pH: Number,
  temperature: Number,
  turbidity: Number,
  tds: Number,
  DO: Number,
  pin: String,
  alert: Boolean,
  timestamp: { type: Date, default: Date.now }
});
 
// Root health check
app.get('/', (req, res) =>{
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Get latest from Blynk and save to DB
app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';
  
  console.log(`🔎 Fetching data for pin: ${pin}, user: ${user}`);

  try {
    const response = await axios.get(`${BLYNK_API}/get?token=${BLYNK_TOKEN}&${pin}`);
    if (!response.data || isNaN(response.data)) {
      return res.status(400).json({ error: 'Invalid sensor data received from Blynk' });
    }
    
    const value = parseFloat(response.data); // for single pin reading like v1

    let sensorFields = {};
    // Map pin to correct sensor field
    switch (pin) {
      case 'v1': sensorFields.pH = value; break;
      case 'v2': sensorFields.temperature = value; break;
      case 'v3': sensorFields.turbidity = value; break;
      case 'v4': sensorFields.tds = value; break;
      case 'v5': sensorFields.DO = value; break;
      default:
        console.warn(`⚠️ Unknown pin received: ${pin}`);
        return res.status(400).json({ error: 'Unknown pin' });
    }
    
    const timestamp = new Date();
    const data = await SensorData.create({ user, pin, ...sensorFields, timestamp });
    
    console.log(`✅ Sensor data saved for ${pin}:`, data);
    res.json({ user, pin, ...sensorFields, timestamp });
    
  } catch (err) {
    console.error(`❌ Error fetching data for ${pin}:`, err.message);

    if (err.response && err.response.status === 403) {
      return res.status(403).json({ error: 'Forbidden - Blynk rejected the request', detail: err.message });
    }
    
    res.status(500).json({ error: 'Failed to get or save sensor data', detail: err.message });
  }
});

// Get latest saved data from DB
app.get('/api/latest-data', async (req, res) => {
  const latest = await SensorData.findOne().sort({ timestamp: -1 });
  if (!latest) return res.status(404).json({ message: 'No data' });
  
    // Determine if water is safe based on your thresholds
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
    const { pH, temperature, turbidity, tds, DO, alert } = req.body;

    if (
      ph === undefined || temp === undefined ||
      turb === undefined || tds === undefined ||
      DO === undefined || alert === undefined
    ) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    
    const user = req.body.user || 'ESP32';
    
    const newData = new SensorData({
      user,
      pH: ph,
      temperature: temp,
      turbidity: turb,
      tds,
      DO,
      alert,
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
