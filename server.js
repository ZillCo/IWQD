const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const mongoose = require('mongoose');

const client = new OAuth2Client("1082316602730-lasg1o8e0ub19u2dduv98i1il8qkl5u5.apps.googleusercontent.com");

// Load environment variables
const MONGO_URL = process.env.MONGO_URL; // and set MONGO_URL in your environment properly
const BLYNK_TOKEN = process.env.BLYNK_TOKEN;
const BLYNK_API = 'https://blynk.cloud/external/api';

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

// Define user schema/model
const User = mongoose.model('User', new mongoose.Schema({
  email: String,
  name: String,
  picture: String
}));

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

// Middleware
app.use(cors({ origin: 'https://zillco.github.io', credentials: true }));
app.use(express.json());
app.use(express.static("public")); // HTML is inside /public

// Root health check
app.get('/', (req, res) => res.send('🌊 IoT Water Quality API is live'));

// Routes
app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';

  try {
    const response = await axios.get(`${BLYNK_API}/get?token=${BLYNK_TOKEN}&${pin}`);
    const value = parseFloat(response.data); // for single pin reading like v1

    let sensorFields = {};

    // Map pin to correct sensor field
    switch (pin) {
      case 'v1':
        sensorFields.pH = value;
        break;
      case 'v2':
        sensorFields.temperature = value;
        break;
      case 'v3':
        sensorFields.turbidity = value;
        break;
      case 'v4':
        sensorFields.tds = value;
        break;
      case 'v5':
        sensorFields.DO = value;
        break;
      default:
        return res.status(400).json({ error: 'Unknown pin' });
    }
    const timestamp = new Date();
    await SensorData.create({
      user,
      pin,
      ...sensorFields,
      timestamp
    });
    
    res.json({ user, pin, ...sensorFields, timestamp });
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
    latest.tds <= 500 &&
    latest.DO >= 6.5 && latest.DO <= 8.5;

  res.json({
    ...latest.toObject(),
    status: isSafe ? 'Safe' : 'Unsafe'
  });
});

app.post("/api/auth/google", async (req, res) => {
  const { idToken, captcha } = req.body;
  if (!idToken || !captcha) {
    return res.status(400).json({ success: false, message: "Missing token or CAPTCHA" });
  }
// Verify Google token
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: "1082316602730-lasg1o8e0ub19u2dduv98i1il8qkl5u5.apps.googleusercontent.com",
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // 👇 Save or update user in DB
        await User.findOneAndUpdate(
      { email },
      { name, picture },
      { upsert: true, new: true }
    );
    
    return res.json({ success: true, email });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
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
