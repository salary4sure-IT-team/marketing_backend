import express from "express";
import { executeQuery } from "../config/mysqlDb.js";

const router = express.Router();

/**
 * @swagger
 * /api/customers/profile:
 *   get:
 *     summary: Get all customer profiles
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for customer name or email
 *     responses:
 *       200:
 *         description: Customer profiles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       500:
 *         description: Server error
 */
router.get("/profile", async (req, res) => {
    try {
        const { limit = 100, offset = 0, search } = req.query;
        
        // Simple query first - no pagination
        let query = "SELECT * FROM customer_profile";
        let countQuery = "SELECT COUNT(*) as total FROM customer_profile";
        let searchParams = [];
        
        // Add search functionality if search term provided
        if (search) {
            const searchTerm = `%${search}%`;
            const whereClause = " WHERE cp_first_name LIKE ? OR cp_sur_name LIKE ? OR cp_mobile LIKE ? OR cp_personal_email LIKE ?";
            query += whereClause;
            countQuery += whereClause;
            searchParams = [searchTerm, searchTerm, searchTerm, searchTerm];
        }
        
        // Add simple LIMIT without OFFSET first
        query += " ORDER BY cp_id DESC LIMIT 10";
        
        // Execute queries
        const [data, countResult] = await Promise.all([
            executeQuery(query, searchParams),
            executeQuery(countQuery, searchParams)
        ]);
        
        const total = countResult[0]?.total || 0;
        
        res.json({
            success: true,
            data: data,
            count: data.length,
            total: total
        });
        
    } catch (error) {
        console.error("Customer profile query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customer profiles",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/customers/profile/{id}:
 *   get:
 *     summary: Get customer profile by ID
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer profile retrieved successfully
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Server error
 */
router.get("/profile/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID
        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID"
            });
        }
        
        const customer = await executeQuery(
            "SELECT * FROM customer_profile WHERE cp_id = ?",
            [id]
        );
        
        if (customer.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }
        
        res.json({
            success: true,
            data: customer[0]
        });
        
    } catch (error) {
        console.error("Customer profile query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customer profile",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/customers/profile/stats:
 *   get:
 *     summary: Get customer profile statistics
 *     tags: [Customers]
 *     responses:
 *       200:
 *         description: Customer statistics retrieved successfully
 *       500:
 *         description: Server error
 */
router.get("/stats", async (req, res) => {
    try {
        // Get various statistics about customer profiles
        const [totalCustomers, activeCustomers, recentCustomers] = await Promise.all([
            executeQuery("SELECT COUNT(*) as total FROM customer_profile"),
            executeQuery("SELECT COUNT(*) as active FROM customer_profile WHERE cp_active = 1"),
            executeQuery("SELECT COUNT(*) as recent FROM customer_profile WHERE cp_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")
        ]);
        
        res.json({
            success: true,
            stats: {
                total: totalCustomers[0]?.total || 0,
                active: activeCustomers[0]?.active || 0,
                recent: recentCustomers[0]?.recent || 0
            }
        });
        
    } catch (error) {
        console.error("Customer stats query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customer statistics",
            error: error.message
        });
    }
});

export default router;
