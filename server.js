const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

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

// Schema
const SensorData = mongoose.model('SensorData', {
  user: String,
  pin: String,
  value: String,
  timestamp: Date
});

app.use(cors());

// Get latest sensor value
app.get('https://iwqd.onrender.com/api/latest/:pin', async (req, res) => {
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

// Get full history by user
app.get('https://iwqd.onrender.com/api/history', async (req, res) => {
  const user = req.query.user || 'default';
  const history = await SensorData.find({ user }).sort({ timestamp: -1 }).limit(100);
  res.json(history);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
