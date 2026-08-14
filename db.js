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

// Automatically create all required tables if they don't exist
async function initializeDatabase() {
    try {
        // Users Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Commute Logs Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS commute_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                starting_point VARCHAR(255),
                destination VARCHAR(255),
                transport_type VARCHAR(100),
                distance FLOAT,
                co2 FLOAT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Home Logs Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS home_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                light_duration FLOAT,
                fan_duration FLOAT,
                ac_duration FLOAT,
                other_duration FLOAT,
                total_co2 FLOAT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Community Posts Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Community Comments Table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT,
                user_id INT,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("All database tables initialized successfully.");
    } catch (err) {
        console.error("Error creating database tables:", err);
    }
}

// Run the initialization
initializeDatabase();

// Export database promise version to use async/await safely
module.exports = promisePool;