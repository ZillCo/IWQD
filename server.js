require('dotenv').config(); // Load variables from .env

const nodemailer = require("nodemailer");
const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');
const bodyParser = require('body-parser');

const PORT = process.env.PORT || 3000;

// For delay logic to prevent spam
let emailSentRecently = false;
let alertEmailList = [
  "recipient@example.com" // Default recipient
];
let lastAlertData = null; // Stores last unsafe values

// Set up email transporter (use your Gmail + app password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ALERT_EMAIL_USER,      // e.g. "youremail@gmail.com"
    pass: process.env.ALERT_EMAIL_PASSWORD   // e.g. "your-app-password"
  },
});

// MongoDB URL
const MONGO_URL = "mongodb+srv://josephmaglaque4:Mmaglaque22@cluster0.vy5rnw7.mongodb.net/iot_dashboard?retryWrites=true&w=majority&appName=Cluster0";

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
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB Error:', err);
});

// Models
const sensorDataSchema = new mongoose.Schema({
  user: String,
  ph: Number,
  temp: Number,
  turb: Number,
  tds: Number,
  do: Number,
  alert: Boolean,
  timestamp: { type: Date, default: Date.now }
});

// Create model
const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Manual sensor data post
app.post('/api/sensordata', async (req, res) => {
  const { user, ph, temp, turb, tds, do: DO, alert } = req.body;
  
   if ([ph, temp, turb, tds, DO].some(val => val === undefined)) {
    console.log('❌ Incomplete data received:', req.body);
    return res.status(400).json({ message: 'Incomplete sensor data' });
  }
    
    // schema fields: pH, temperature, turbidity, tds, DO, user, timestamp
  try {
    const newData = new SensorData({ user, ph, temp, turb, tds, do: DO, alert });
    await newData.save();
    console.log('✅ Data saved:', newData);

  const isUnsafe =
    ph < 6.5 || ph > 8.5 ||
    turb > 5 ||
    temp < 15 || temp > 30 ||
    tds > 500;
  
  // Check if values changed
  const isDuplicate =
    lastAlertData &&
    lastAlertData.ph === ph &&
    lastAlertData.temp === temp &&
    lastAlertData.turb === turb &&
    lastAlertData.tds === tds;
  
  if (isUnsafe && !isDuplicate && !emailSentRecently) {
    setTimeout(() => {
      lastAlertData = null;
    }, 5 * 60 * 1000); // Clear after 5 minutes
    
    sendEmail(ph, temp, turb, tds);
    lastAlertData = { ph, temp, turb, tds }; // save last alert values
    emailSentRecently = true;
    setTimeout(() => {
      emailSentRecently = false;
    }, 60000);
  }

    // 🔔 Send email alert if unsafe
    if (alert === true) {
      const mailOptions = {
  from: `"Water Quality Monitor" <${process.env.AEUA}>`,
  to: "recipient@example.com", // 👉 Replace with actual email or user email field
  subject: "🚨 Water Quality Alert",
  text: `Unsafe water detected!
  
  Sensor values:
  - pH: ${ph}
  - Temperature: ${temp} °C
  - Turbidity: ${turb} NTU
  - TDS: ${tds} ppm
  - DO: ${DO} mg/L
  
  Please check the dashboard immediately.`,
};
  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Email alert sent.");
  } catch (emailErr) {
    console.error("❌ Email alert failed:", emailErr);
  }
}
    res.status(201).json({ message: 'Data saved', data: newData });
  } catch (err) {
    console.error('❌ Error saving data:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/latest/:pin', async (req, res) => {
  const { pin } = req.params;
  
  const pinFieldMap = {
    'v1': 'ph',
    'v2': 'temp',
    'v3': 'turb',
    'v4': 'tds',
    'v5': 'do',
  };

  const field = pinFieldMap[pin];
  
  if (!field) {
    return res.status(400).json({ error: 'Invalid pin' });
  }

  try {
    const latestData = await SensorData.findOne({ 
    [field]: { $exists: true, $ne: null } 
  })
  .sort({ timestamp: -1 })
  .select(`${field} timestamp`)
  .exec();
    console.log('📦 Found latest:', latestData);
    
    if (!latestData) {
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
    latest.ph >= 6.5 && latest.ph <= 8.5 &&
    latest.temp >= 20 && latest.temp <= 35 &&
    latest.turb <= 5 &&
    latest.tds <= 500 &&
    latest.do >= 6.5 && latest.do <= 8.5;

  res.json({ ...latest.toObject(), status: isSafe ? 'Safe' : 'Unsafe' });
});

// Get data history
app.get('/api/history', async (req, res) => {
  try {
    const history = await SensorData.find({}).sort({ timestamp: -1 }).limit(100);
    res.json(history);
  } catch (err) {
    console.error('❌ Error retrieving history:', err);
    res.status(500).json({ message: 'Failed to retrieve data' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // make sure index.html is really in root
});

app.post('/api/add-email', (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email' });
  }

  if (!alertEmailList.includes(email)) {
    alertEmailList.push(email);
    console.log("✅ Added email:", email);
    return res.json({ message: 'Email added to alert list' });
  } else {
    return res.json({ message: 'Email already in list' });
  }
});


function sendEmail(ph, temp, turb, tds) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.AEUA,
      pass: process.env.AEP  // Use App Password, not your Gmail password
    }
  });

  const mailOptions = {
    from: process.env.AEUA,
    to: alertEmailList.join(',') && process.env.AEUA, // Send to all collected emails
    subject: '🚨 Water Contamination Alert',
    html: `
      <h2>Alert: Water Quality Issue</h2>
      <p>Detected unsafe readings:</p>
      <ul>
        <li><strong>pH:</strong> ${ph}</li>
        <li><strong>Temperature:</strong> ${temp} °C</li>
        <li><strong>Turbidity:</strong> ${turb} NTU</li>
        <li><strong>TDS:</strong> ${tds} ppm</li>
      </ul>
      <p>Timestamp: ${new Date().toLocaleString()}</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("❌ Email error:", error);
    } else {
      console.log("✅ Email sent:", info.response);
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
