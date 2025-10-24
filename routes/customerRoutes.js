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
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD) for filtering by creation date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD) for filtering by creation date
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
 *                     properties:
 *                       cp_id:
 *                         type: integer
 *                       cp_first_name:
 *                         type: string
 *                       cp_sur_name:
 *                         type: string
 *                       cp_mobile:
 *                         type: string
 *                       cp_personal_email:
 *                         type: string
 *                       cp_journey_stage:
 *                         type: string
 *                       journey_stage_name:
 *                         type: string
 *                         description: Human-readable journey stage name
 *                       journey_stage_code:
 *                         type: string
 *                         description: Journey stage code
 *                       journey_stage_active:
 *                         type: integer
 *                         description: Whether the journey stage is active
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
 *                     hasMore:
 *                       type: boolean
 *                 dateRange:
 *                   type: object
 *                   properties:
 *                     startDate:
 *                       type: string
 *                     endDate:
 *                       type: string
 *       400:
 *         description: Invalid date format or parameters
 *       500:
 *         description: Server error
 */
router.get("/profile", async (req, res) => {
    try {
        const { limit = 100, offset = 0, search, startDate, endDate } = req.query;
        
        // Parse and validate limit/offset
        let limitNum = parseInt(limit) || 100;
        let offsetNum = parseInt(offset) || 0;
        
        if (isNaN(limitNum) || limitNum < 1) limitNum = 100;
        if (isNaN(offsetNum) || offsetNum < 0) offsetNum = 0;
        if (limitNum > 1000) limitNum = 1000; // Max limit for performance
        
        // Simple query first - no pagination with JOIN
        let query = `SELECT cp.*, mjs.m_journey_stage as journey_stage_name, mjs.m_journey_code as journey_stage_code, mjs.m_journey_active as journey_stage_active
                     FROM customer_profile cp 
                     LEFT JOIN master_journey_stage mjs ON cp.cp_journey_stage = mjs.m_journey_id`;
        let countQuery = "SELECT COUNT(*) as total FROM customer_profile";
        let searchParams = [];
        
        // Add search functionality if search term provided
        if (search) {
            const searchTerm = `%${search}%`;
            const whereClause = " WHERE cp.cp_first_name LIKE ? OR cp.cp_sur_name LIKE ? OR cp.cp_mobile LIKE ? OR cp.cp_personal_email LIKE ?";
            query += whereClause;
            countQuery += whereClause;
            searchParams = [searchTerm, searchTerm, searchTerm, searchTerm];
        }
        
        // Add date range filtering if both dates provided
        if (startDate && endDate) {
            // Validate date format (YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: "Date format must be YYYY-MM-DD"
                });
            }
            
            // Validate date range
            if (new Date(startDate) > new Date(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: "Start date must be before or equal to end date"
                });
            }
            
            // Add date filter to existing WHERE clause or create new one
            const dateClause = "DATE(cp.cp_created_at) BETWEEN ? AND ?";
            if (search) {
                query += " AND " + dateClause;
                countQuery += " AND " + dateClause;
                searchParams.push(startDate, endDate);
            } else {
                query += " WHERE " + dateClause;
                countQuery += " WHERE " + dateClause;
                searchParams = [startDate, endDate];
            }
        }
        
        // Add simple LIMIT without OFFSET first
        query += " ORDER BY cp.cp_id DESC LIMIT 100";
        
        // Execute queries
        const [data, countResult] = await Promise.all([
            executeQuery(query, searchParams),
            executeQuery(countQuery, searchParams)
        ]);
        
        const total = countResult[0]?.total || 0;
        
        const response = {
            success: true,
            data: data,
            count: data.length,
            total: total
        };
        
        // Add date range info if provided
        if (startDate && endDate) {
            response.dateRange = {
                startDate: startDate,
                endDate: endDate
            };
        }
        
        res.json(response);
        
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
