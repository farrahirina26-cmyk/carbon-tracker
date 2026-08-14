const mysql = require('mysql2');
require('dotenv').config();

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 27412,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// Automatically create all required tables matching index.js queries
async function initializeDatabase() {
    try {
        // 1. Users Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Trips Table (For Commute Logs)
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS trips (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                start_point VARCHAR(255),
                destination VARCHAR(255),
                transport_type VARCHAR(100),
                distance_km FLOAT,
                carbon_emission_kg FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Home Consumption Table (For Home Logs)
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS home_consumption (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                lights_count INT,
                fans_count INT,
                ac_count INT,
                devices_count INT,
                total_home_carbon_kg FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Feedbacks Table (For Community Hub & Comments)
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                user_name VARCHAR(255),
                rating INT,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("All tables (users, trips, home_consumption, feedbacks) initialized successfully.");
    } catch (err) {
        console.error("Error initializing database tables:", err);
    }
}

// Run the initialization
initializeDatabase();

// Export database promise version to use async/await safely
module.exports = promisePool;