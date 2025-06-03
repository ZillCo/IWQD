require('dotenv').config(); // Load variables from .env

const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');
const bodyParser = require('body-parser');

const PORT = process.env.PORT || 3000;

// MongoDB URL
const MONGO_URL = "mongodb+srv://josephmaglaque4:Mmaglaque22@cluster0.vy5rnw7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Middleware
app.use(express.json());

app.use(express.static(path.join(__dirname, 'index.html'))); // HTML is inside /public

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(cors({
  origin: 'https://zillco.github.io',  // allow your frontend
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json());

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

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
const sensorDataSchema = new mongoose.Schema({
  user: String,
  ph: Number,
  temp: Number,
  turb: Number,
  tds: Number,
  do: Number,
  alert: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Create model
const SensorData = mongoose.model('SensorData', sensorDataSchema);

app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';

  const pinFieldMap = {
    'v1': 'ph',
    'v2': 'temp',
    'v3': 'turb',
    'v4': 'tds',
    'v5': 'DO',
  };

  const field = pinFieldMap[pin];
  
  if (!field) {
    return res.status(400).json({ error: 'Invalid pin' });
  }

  try {
    const latestData = await SensorData.findOne({ 
    user,
    [field]: { $exists: true, $ne: null } 
  })
  .sort({ timestamp: -1 })
  .select(`${field} timestamp`)
  .exec();
    console.log('latestData:', latestData);

    if (!latestData || latestData[field] === undefined) {
      return res.status(404).json({ error: 'No data found for this pin' });
    }

    res.json({
      pin,
      value: latestData[field],
      timestamp: latestData.timestamp
    });

  } catch (err) {
    console.error(`❌ Error fetching DB data for ${pin}:`, err.message);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});


// Get latest saved data from DB
app.get('/api/latest-data', async (req, res) => {
  const latest = await SensorData.findOne().sort({ timestamp: -1 });
  if (!latest) return res.status(404).json({ message: 'No data' });
  
    // Determine if water is safe based on your thresholds
  const isSafe =
    latest.ph >= 6.5 && latest.pH <= 8.5 &&
    latest.temp >= 20 && latest.temp <= 35 &&
    latest.turb <= 5 &&
    latest.tds <= 500 &&
    latest.DO >= 6.5 && latest.DO <= 8.5;

  res.json({ ...latest.toObject(), status: isSafe ? 'Safe' : 'Unsafe' });
});

// Manual sensor data post
app.post('/api/data', async (req, res) => {
    console.log("Incoming data:", req.body); // 👈 this line
  try {
    const {
      ph,
      temp,
      turb,
      tds,
      DO: dissolvedOxygen,
      alert,
      user = 'default'
    } = req.body;
    
    if (
      ph === undefined || temp === undefined ||
      turb === undefined || tds === undefined ||
      dissolvedOxygen === undefined || alert === undefined
    ) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    
    // Example schema fields: pH, temperature, turbidity, tds, DO, user, timestamp
const newData = new SensorData({
      ph: ph,              // map ph -> pH
      temp: temp,   // map temp -> temperature
      turb: turb,     // map turb -> turbidity
      tds: tds,            // tds as is
      do: dissolvedOxygen, // do -> DO
      alert: alert.toString(),  // convert alert (bool) to string
      user,
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // make sure index.html is really in root
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
