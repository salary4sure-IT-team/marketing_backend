import express from "express";
import { executeQuery } from "../config/mysqlDb.js";
import mongoose from "mongoose";

const router = express.Router();

/**
 * @swagger
 * /api/example/mysql:
 *   get:
 *     summary: Example MySQL query
 *     tags: [Examples]
 *     parameters:
 *       - in: query
 *         name: table
 *         schema:
 *           type: string
 *         description: Table name to query
 *     responses:
 *       200:
 *         description: Successful query
 *       500:
 *         description: Server error
 */
router.get("/mysql", async (req, res) => {
    try {
        const tableName = req.query.table || "users";
        
        // Example: Get data from MySQL (read-only)
        // Sanitize table name to prevent SQL injection
        const allowedTables = ["users", "orders", "products"];
        
        if (!allowedTables.includes(tableName)) {
            return res.status(400).json({
                success: false,
                message: "Invalid table name"
            });
        }
        
        const results = await executeQuery(
            `SELECT * FROM ${tableName} LIMIT 10`
        );
        
        res.json({
            success: true,
            data: results,
            count: results.length
        });
    } catch (error) {
        console.error("MySQL query error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/example/mongodb:
 *   get:
 *     summary: Example MongoDB query
 *     tags: [Examples]
 *     responses:
 *       200:
 *         description: Successful query
 *       500:
 *         description: Server error
 */
router.get("/mongodb", async (req, res) => {
    try {
        // Example: List all collections in MongoDB
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        res.json({
            success: true,
            database: mongoose.connection.name,
            collections: collections.map(c => c.name),
            count: collections.length
        });
    } catch (error) {
        console.error("MongoDB query error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/example/combined:
 *   get:
 *     summary: Example combining data from both databases
 *     tags: [Examples]
 *     responses:
 *       200:
 *         description: Successful query
 *       500:
 *         description: Server error
 */
router.get("/combined", async (req, res) => {
    try {
        // Get data from MySQL
        const mysqlData = await executeQuery("SELECT COUNT(*) as total FROM users");
        
        // Get data from MongoDB
        const mongoStats = mongoose.connection.db.stats();
        
        res.json({
            success: true,
            data: {
                mysql: {
                    userCount: mysqlData[0]?.total || 0
                },
                mongodb: {
                    stats: await mongoStats
                }
            }
        });
    } catch (error) {
        console.error("Combined query error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;

