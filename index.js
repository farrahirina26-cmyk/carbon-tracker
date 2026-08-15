const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db'); // Ensure db connection uses mysql2/promise
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Express Session Setup
app.use(session({
    secret: 'secret-key-eco-tracker',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));


// Root route to show landing page first
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Test Route
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        res.send('Server is Running! DB Connected.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Database Connection Failed!');
    }
});

app.use(express.static('public'));

app.use(express.static('public'));

// Add missing columns to Aiven database automatically on server start
db.query(`ALTER TABLE home_consumption 
          ADD COLUMN IF NOT EXISTS light_hours INT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS fan_hours INT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS ac_hours INT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS device_hours INT DEFAULT 0`)
  .then(() => console.log("Columns added successfully to Aiven database!"))
  .catch(err => console.log("Error adding columns:", err.message));

// Auth Middleware

// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized, please log in.' });
};

// Get Logged-in User API
app.get('/api/user', isAuthenticated, (req, res) => {
    res.json(req.session.user);
});

// 1. REGISTER ROUTE
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Shob field fill-up korun!' });
    }
    try {
        const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'Ei email diye account already ache!' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        res.status(201).json({ message: 'Registration successfully completed!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during registration!' });
    }
});

// 2. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and Password are required!' });
    }
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!rows || rows.length === 0) {
            return res.status(400).json({ message: 'User not found!' });
        }
        
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password!' });
        }

        req.session.user = { id: user.id, name: user.name, email: user.email };

        req.session.save((err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Session save error!' });
            }
            res.status(200).json({
                message: 'Login successful!',
                user: { id: user.id, name: user.name, email: user.email }
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during login!' });
    }
});

// 3. LOGOUT ROUTE
app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            res.clearCookie('connect.sid');
            return res.redirect('/login.html');
        });
    } else {
        return res.redirect('/login.html');
    }
});

// 4. COMMUTE LOGS API
app.get('/api/commute-logs', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM trips WHERE user_id = ? ORDER BY id DESC', [req.session.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching commute logs' });
    }
});

app.post('/api/commute-logs', isAuthenticated, async (req, res) => {
    const { startPoint, destination, transportType, distance, co2Emission, date } = req.body;
    try {
        const distNum = parseFloat(distance) || 0;
        const [result] = await db.query(
            'INSERT INTO trips (user_id, start_point, destination, transport_type, distance_km, carbon_emission_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.user.id, startPoint, destination, transportType, distNum, co2Emission, date || new Date()]
        );
        res.status(201).json({ message: 'Commute log saved', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to save commute log' });
    }
});

// DELETE COMMUTE LOG ROUTE
app.delete('/api/commute-logs/:id', isAuthenticated, async (req, res) => {
    const logId = req.params.id;
    const userId = req.session.user.id;
    try {
        const [result] = await db.query('DELETE FROM trips WHERE id = ? AND user_id = ?', [logId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Log not found or unauthorized' });
        }
        res.status(200).json({ message: 'Commute log deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete commute log' });
    }
});

// 5. HOME LOGS API
app.get('/api/home-logs', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM home_consumption WHERE user_id = ? ORDER BY id DESC', [req.session.user.id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching home logs' });
    }
});

app.post('/api/home-logs', isAuthenticated, async (req, res) => {
    const { lightCount, lightHours, fanCount, fanHours, acCount, acHours, deviceCount, deviceHours, co2Emission } = req.body;
    try {
        const [result] = await db.query(
            `INSERT INTO home_consumption (user_id, lights_count, light_hours, fans_count, fan_hours, ac_count, ac_hours, devices_count, device_hours, total_home_carbon_kg, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [req.session.user.id, lightCount, lightHours, fanCount, fanHours, acCount, acHours, deviceCount, deviceHours, co2Emission]
        );
        res.status(201).json({ message: 'Home log saved', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to save home log', error: err.message });
    }
});    


// DELETE HOME LOG ROUTE
app.delete('/api/home-logs/:id', isAuthenticated, async (req, res) => {
    const logId = req.params.id;
    const userId = req.session.user.id;
    try {
        const [result] = await db.query('DELETE FROM home_consumption WHERE id = ? AND user_id = ?', [logId, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Log not found or unauthorized' });
        }
        res.status(200).json({ message: 'Home log deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete home log' });
    }
});

// COMMUNITY FEEDBACK API
app.get('/api/feedback', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM feedbacks ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching feedback' });
    }
});

app.post('/api/feedback', isAuthenticated, async (req, res) => {
    const { rating, comment } = req.body;
    if (!rating || !comment) {
        return res.status(400).json({ message: 'Rating and comment are required!' });
    }
    try {
        const userId = req.session.user.id;
        const userName = req.session.user.name;

        const [result] = await db.query(
            'INSERT INTO feedbacks (user_id, user_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
            [userId, userName, rating, comment, new Date()]
        );
        res.status(201).json({ message: 'Feedback saved successfully', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to save feedback' });
    }
});

// Graph Analysis পেজ দেখানোর জন্য রুট
app.get('/graph.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'graph.html'));
});

app.get('/api/carbon-data', async (req, res) => {
    let combinedData = {};
    const userId = (req.session && req.session.user && req.session.user.id) ? req.session.user.id : 1;

    try {
        const [homeResults] = await db.query(
            `SELECT DATE(created_at) as consumption_date, SUM(total_home_carbon_kg) as carbon_emission FROM home_consumption WHERE user_id = ? GROUP BY DATE(created_at)`,
            [userId]
        );
        if (Array.isArray(homeResults)) {
            homeResults.forEach(item => {
                if (item.consumption_date) {
                    let dStr = new Date(item.consumption_date).toISOString().split('T')[0];
                    combinedData[dStr] = (combinedData[dStr] || 0) + parseFloat(item.carbon_emission || 0);
                }
            });
        }
    } catch (e) {
        console.log("Home consumption error:", e.message);
    }

    try {
        const [tripResults] = await db.query(
            `SELECT DATE(created_at) as consumption_date, SUM(carbon_emission_kg) as carbon_emission FROM trips WHERE user_id = ? GROUP BY DATE(created_at)`,
            [userId]
        );
        if (Array.isArray(tripResults)) {
            tripResults.forEach(item => {
                if (item.consumption_date) {
                    let dStr = new Date(item.consumption_date).toISOString().split('T')[0];
                    combinedData[dStr] = (combinedData[dStr] || 0) + parseFloat(item.carbon_emission || 0);
                }
            });
        }
    } catch (e) {
        console.log("Trips error:", e.message);
    }

    const finalResults = Object.keys(combinedData).map(date => ({
        consumption_date: date,
        carbon_emission: combinedData[date]
    }));

    res.json(finalResults);
});


// রিয়েল-টাইম পারফরম্যান্স কম্পারিজন API (মিডলওয়্যার ছাড়া, যাতে সেশন মিসিং থাকলেও এরর না খায়)
app.get('/api/performance-stat', async (req, res) => {
  try {
    // যদি সেশন থাকে তবে তার আইডি নিবে, না থাকলে ডিফল্টভাবে ১ নং ইউজার ধরবে
    const currentUserId = (req.session && req.session.user && req.session.user.id) ? req.session.user.id : 1;

    // সব ইউজারের মোট কার্বন নির্গমন (Home + Trips) বের করার কুয়েরি
    const query = `
      SELECT u.id as user_id, 
             (IFNULL(h.total_home, 0) + IFNULL(t.total_trip, 0)) as total_emission
      FROM users u
      LEFT JOIN (
          SELECT user_id, SUM(total_home_carbon_kg) as total_home 
          FROM home_consumption GROUP BY user_id
      ) h ON u.id = h.user_id
      LEFT JOIN (
          SELECT user_id, SUM(carbon_emission_kg) as total_trip 
          FROM trips GROUP BY user_id
      ) t ON u.id = t.user_id
    `;
    
    const [results] = await db.query(query);

    if (!results || results.length === 0) {
      return res.json({ percentile: 100 });
    }

    let currentUserEmission = 0;
    const userEmissions = results.map(row => {
      if (row.user_id === currentUserId) {
        currentUserEmission = parseFloat(row.total_emission || 0);
      }
      return parseFloat(row.total_emission || 0);
    });

    const totalUsers = userEmissions.length;
    if (totalUsers <= 1) {
      return res.json({ percentile: 100 });
    }

    let betterThanCount = 0;
    userEmissions.forEach(emission => {
      if (emission > currentUserEmission) {
        betterThanCount++;
      }
    });

    const percentile = Math.round((betterThanCount / totalUsers) * 100);
    res.json({ percentile: percentile });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});