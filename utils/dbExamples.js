/**
 * Example usage of both MongoDB and MySQL connections
 */

import mongoose from "mongoose";
import { executeQuery, getMySQLPool } from "../config/mysqlDb.js";

/**
 * MongoDB Example - Using Mongoose Model
 */
export const mongoExample = async () => {
    try {
        // Define a schema (this would typically be in a models folder)
        const userSchema = new mongoose.Schema({
            name: String,
            email: String,
            createdAt: { type: Date, default: Date.now }
        });
        
        const User = mongoose.model('User', userSchema);
        
        // Create a new user
        const newUser = await User.create({
            name: "John Doe",
            email: "john@example.com"
        });
        
        // Find users
        const users = await User.find({});
        
        return users;
    } catch (error) {
        console.error("MongoDB operation error:", error);
        throw error;
    }
};

/**
 * MySQL Example - Read-only operations
 */
export const mysqlReadExample = async () => {
    try {
        // Example 1: Simple SELECT query using executeQuery
        const users = await executeQuery(
            "SELECT * FROM users WHERE active = ?",
            [1]
        );
        
        console.log("Users:", users);
        return users;
    } catch (error) {
        console.error("MySQL read error:", error);
        throw error;
    }
};

/**
 * MySQL Example - Using connection pool directly for more control
 */
export const mysqlPoolExample = async () => {
    const pool = getMySQLPool();
    const connection = await pool.getConnection();
    
    try {
        // Start transaction (even though read-only, for demonstration)
        await connection.beginTransaction();
        
        // Execute multiple queries
        const [rows1] = await connection.execute("SELECT * FROM table1");
        const [rows2] = await connection.execute("SELECT * FROM table2 WHERE id = ?", [1]);
        
        await connection.commit();
        
        return { rows1, rows2 };
    } catch (error) {
        await connection.rollback();
        console.error("MySQL pool error:", error);
        throw error;
    } finally {
        connection.release(); // Always release connection back to pool
    }
};

/**
 * MySQL Example - Prepared statements for better performance
 */
export const mysqlPreparedStatementExample = async () => {
    const pool = getMySQLPool();
    
    try {
        // Using prepared statements (more efficient for repeated queries)
        const [rows] = await pool.execute(
            "SELECT * FROM orders WHERE user_id = ? AND status = ?",
            [123, 'completed']
        );
        
        return rows;
    } catch (error) {
        console.error("MySQL prepared statement error:", error);
        throw error;
    }
};

/**
 * Example: Combining data from both databases
 */
export const combinedDataExample = async () => {
    try {
        // Get data from MongoDB
        const User = mongoose.model('User');
        const mongoUsers = await User.find({}).limit(10);
        
        // Get data from MySQL
        const mysqlData = await executeQuery("SELECT * FROM reports LIMIT 10");
        
        // Combine or process data as needed
        return {
            mongoUsers,
            mysqlReports: mysqlData
        };
    } catch (error) {
        console.error("Combined data error:", error);
        throw error;
    }
};

