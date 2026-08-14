const mysql = require('mysql2');
require('dotenv').config();

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 27412, // পোর্টের ঝামেলা এড়াতে পোর্ট যোগ করা হলো
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// Automatically create the users table if it doesn't exist
async function initializeDatabase() {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await promisePool.query(createTableQuery);
        console.log("Users table verified/created successfully.");
    } catch (err) {
        console.error("Error creating users table:", err);
    }
}

// Run the initialization
initializeDatabase();

// Export database promise version to use async/await safely
module.exports = promisePool;