const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 5000;

// Replace with your actual token
const BLYNK_TOKEN = 'oVXe6YV3PrFqXQmtDg3H3eSPo2kgzJmc';
const BLYNK_API = 'https://blynk.cloud/external/api';

// MongoDB connection
mongoose.connect('mongodb+srv://josephmaglaque4:<fVHSGuLaX7SjXVbi>@cluster0.vy5rnw7.mongodb.net/iotdb?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// SensorData model (put it here!)
const SensorData = mongoose.model('SensorData', {
  user: String,
  pH: Number,
  temperature: Number,
  turbidity: Number,
  tds: Number,
  pin: String,
  timestamp: Date
});

// Schema
const SensorData = mongoose.model('SensorData', {
  user: String,
  pin: String,
  value: String,
  timestamp: Date
});

app.use(cors());
app.use(express.json());

// Get latest sensor value
app.get('/api/latest/:pin', async (req, res) => {
  const pin = req.params.pin;
  const user = req.query.user || 'default';

  try {
    const response = await axios.get(`${BLYNK_API}/get?token=${BLYNK_TOKEN}&${pin}`);
    const value = response.data;

    // Save to MongoDB
    await SensorData.create({ user, pin, value, timestamp: new Date() });

    res.json({ value, user, pin, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get or save sensor data', detail: err.message });
  }
});
app.get('/api/latest-data', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });

  const latest = await SensorData.findOne().sort({ timestamp: -1 });

  if (!latest) return res.status(404).json({ message: 'No data' });

  // Example logic
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
const User = mongoose.model('User', {
  name: String,
  email: String,
  picture: String
});
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: 'your_mongo_connection_url',
    collectionName: 'sessions'
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));
app.post('/auth/google', async (req, res) => {
  const { name, email, picture } = req.body;

  if (!email) return res.status(400).json({ message: 'Missing email' });
 
  
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name, email, picture });

  req.session.user = {
    id: user._id,
    name: user.name,
    email: user.email,
    picture: user.picture
  };

  res.json({ message: 'Login successful' });
});


// Get full history by user
app.get('/api/history', async (req, res) => {
  const user = req.query.user || 'default';
  const history = await SensorData.find({ user }).sort({ timestamp: -1 }).limit(100);
  res.json(history);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
