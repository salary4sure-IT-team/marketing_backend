import express from "express";
import { executeQuery } from "../config/mysqlDb.js";
import { v4 as uuidv4 } from 'uuid';
import SmsLog from "../models/SmsLog.js";
import { sendSMSViaAiSensy } from "../services/smsService.js";
import { sendTransactionalSms, sendWhatsappMessage } from "../utils/smsProviders.js";

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
            const countDateClause = "DATE(cp_created_at) BETWEEN ? AND ?";
            if (search) {
                query += " AND " + dateClause;
                countQuery += " AND " + countDateClause;
                searchParams.push(startDate, endDate);
            } else {
                query += " WHERE " + dateClause;
                countQuery += " WHERE " + countDateClause;
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

/**
 * @swagger
 * /api/customers/by-state:
 *   get:
 *     summary: Get customer count by state
 *     tags: [Customers]
 *     description: Returns a simple key-value object with state names and customer counts
 *     responses:
 *       200:
 *         description: Customer count by state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   example:
 *                     "Bihar": 50
 *                     "Maharashtra": 30
 *                     "Delhi": 25
 *       500:
 *         description: Server error
 */
router.get("/by-state", async (req, res) => {
    try {
        // Simple query to get all customers with state information
        const query = `SELECT 
                        ms.m_state_name as state_name
                     FROM customer_profile cp 
                     LEFT JOIN master_city mc ON cp.cp_residence_city_id = mc.m_city_id
                     LEFT JOIN master_state ms ON mc.m_city_state_id = ms.m_state_id
                     WHERE cp.cp_residence_city_id IS NOT NULL`;
        
        // Execute query
        const customers = await executeQuery(query);
        
        // Group customers by state and count them
        const stateCounts = {};
        
        customers.forEach(customer => {
            const stateName = customer.state_name || 'Unknown State';
            
            if (!stateCounts[stateName]) {
                stateCounts[stateName] = 0;
            }
            stateCounts[stateName]++;
        });
        
        res.json({
            success: true,
            data: stateCounts
        });
        
    } catch (error) {
        console.error("Customer by state query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customers by state",
            error: error.message
        });
    }
});


/**
 * @swagger
 *   :
 *   get:
 *     summary: Get customer count grouped by journey stage
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-01-01
 *         required: true
 *         description: Start date (YYYY-MM-DD) for filtering by creation date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-12-31
 *         required: true
 *         description: End date (YYYY-MM-DD) for filtering by creation date
 *     responses:
 *       200:
 *         description: Customer count by journey stage retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 journey_stage:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       customer:
 *                         type: integer
 *                         description: Count of customers in this journey stage
 *                       stage:
 *                         type: string
 *                         description: Journey stage name from master_journey_stage
 *                       stage_id:
 *                         type: integer
 *                         description: Journey stage ID
 *                   example:
 *                     "8":
 *                       customer: 10
 *                       stage: "eKYC initiated"
 *                     "9":
 *                       customer: 5
 *                       stage: "Document Upload"
 *       400:
 *         description: Invalid date format or missing dates
 *       500:
 *         description: Server error
 */
router.get("/by-journey-stage", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validate required parameters
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: "Start date and end date are required"
            });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({
                success: false,
                message: "Date format must be YYYY-MM-DD"
            });
        }

        // Query to get customer count grouped by journey stage
        const query = `
            SELECT 
                cp.cp_journey_stage as stage_id,
                mjs.m_journey_stage as stage_name,
                COUNT(*) as customer_count
            FROM customer_profile cp
            LEFT JOIN master_journey_stage mjs ON cp.cp_journey_stage = mjs.m_journey_id
            WHERE DATE(cp.cp_created_at) BETWEEN ? AND ?
              AND cp.cp_journey_stage IS NOT NULL
            GROUP BY cp.cp_journey_stage, mjs.m_journey_stage
            ORDER BY cp.cp_journey_stage ASC
        `;

        const results = await executeQuery(query, [startDate, endDate]);

        // Build the response object in the requested format
        const journeyStage = {};

        results.forEach(row => {
            const stageId = String(row.stage_id);
            journeyStage[stageId] = {
                customer: row.customer_count || 0,
                stage: row.stage_name || 'Unknown Stage',
                stage_id: row.stage_id
            };
        });

        res.json({
            success: true,
            journey_stage: journeyStage,
            dateRange: {
                startDate,
                endDate
            },
            totalStages: Object.keys(journeyStage).length,
            totalCustomers: results.reduce((sum, row) => sum + (row.customer_count || 0), 0)
        });

    } catch (error) {
        console.error("Customer by journey stage query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customers by journey stage",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/customers/by-journey-stage/{stageId}:
 *   get:
 *     summary: Get all customers in a specific journey stage with SMS status
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Journey stage ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Records per page
 *     responses:
 *       200:
 *         description: Customers retrieved successfully with SMS status
 */
router.get("/by-journey-stage/:stageId", async (req, res) => {
    try {
        const { stageId } = req.params;
        const { page = 1, limit = 100 } = req.query;

        // Validate stage ID
        if (!stageId || isNaN(stageId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid journey stage ID"
            });
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 100;
        const offset = (pageNum - 1) * limitNum;

        // Fetch customers from MySQL by journey stage
        const query = `
            SELECT 
                cp.cp_id,
                cp.cp_first_name,
                cp.cp_sur_name,
                cp.cp_mobile,
                cp.cp_personal_email,
                cp.cp_journey_stage,
                cp.cp_created_at,
                mjs.m_journey_stage as journey_stage_name
            FROM customer_profile cp
            LEFT JOIN master_journey_stage mjs ON cp.cp_journey_stage = mjs.m_journey_id
            WHERE cp.cp_journey_stage = ?
              AND cp.cp_mobile IS NOT NULL
              AND cp.cp_mobile != ''
              AND LENGTH(cp.cp_mobile) >= 10
            ORDER BY cp.cp_id DESC
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM customer_profile cp
            WHERE cp.cp_journey_stage = ?
              AND cp.cp_mobile IS NOT NULL
              AND cp.cp_mobile != ''
              AND LENGTH(cp.cp_mobile) >= 10
        `;

        const [customers, countResult] = await Promise.all([
            executeQuery(query, [stageId, limitNum, offset]),
            executeQuery(countQuery, [stageId])
        ]);

        const total = countResult[0]?.total || 0;

        // Get customer IDs for SMS status lookup
        const customerIds = customers.map(c => c.cp_id);

        // Fetch SMS logs for these customers from MongoDB
        let smsLogs = [];
        if (customerIds.length > 0) {
            smsLogs = await SmsLog.find({
                customer_id: { $in: customerIds },
                status: 'sent'
            }).sort({ created_at: -1 });
        }

        // Create a map of customer_id to latest SMS log
        const smsStatusMap = new Map();
        smsLogs.forEach(log => {
            if (!smsStatusMap.has(log.customer_id)) {  
                smsStatusMap.set(log.customer_id, {
                    sms_sent: true,
                    sms_sent_at: log.sent_at || log.created_at,
                    last_sms_status: log.status,
                    last_sms_campaign: log.campaign_name
                });
            }
        });

        // Add SMS status to customers
        const customersWithSmsStatus = customers.map(customer => {
            const smsStatus = smsStatusMap.get(customer.cp_id) || {
                sms_sent: false,
                sms_sent_at: null,
                last_sms_status: null,
                last_sms_campaign: null
            };

            return {
                ...customer,
                sms_status: smsStatus
            };
        });

        res.json({
            success: true,
            data: customersWithSmsStatus,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                pages: Math.ceil(total / limitNum)
            },
            journey_stage: {
                stage_id: parseInt(stageId),
                stage_name: customers[0]?.journey_stage_name || 'Unknown Stage'
            }
        });

    } catch (error) {
        console.error("Error fetching customers by journey stage:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch customers by journey stage",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/customers/send-bulk-sms:
 *   post:
 *     summary: Send bulk SMS to customers in a specific journey stage
 *     tags: [Customers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - journeyStage
 *               - campaignName
 *               - message
 *             properties:
 *               journeyStage:
 *                 type: integer
 *                 description: Journey stage ID
 *               campaignName:
 *                 type: string
 *                 example: "Missing Document"
 *               message:
 *                 type: string
 *                 description: SMS message content
 *               templateParams:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Template parameters for dynamic content
 *     responses:
 *       200:
 *         description: Bulk SMS job started successfully
 */
router.post("/send-bulk-sms", async (req, res) => {
    try {
        const { journeyStage, campaignName, message, templateParams } = req.body;

        // Validation
        if (!journeyStage || !campaignName || !message) {
            return res.status(400).json({
                success: false,
                message: "Journey stage, campaign name, and message are required"
            });
        }

        // Fetch customers from MySQL by journey stage
        const query = `
            SELECT 
                cp.cp_id,
                cp.cp_mobile,
                cp.cp_first_name,
                cp.cp_sur_name,
                cp.cp_journey_stage,
                mjs.m_journey_stage as journey_stage_name
            FROM customer_profile cp
            LEFT JOIN master_journey_stage mjs ON cp.cp_journey_stage = mjs.m_journey_id
            WHERE cp.cp_journey_stage = ?
              AND cp.cp_mobile IS NOT NULL
              AND cp.cp_mobile != ''
              AND LENGTH(cp.cp_mobile) >= 10
        `;

        const customers = await executeQuery(query, [journeyStage]);

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No customers found for the given journey stage"
            });
        }

        // Limit to 1000 customers
        const limitedCustomers = customers.slice(0, 1000);
        
        if (customers.length > 1000) {
            console.warn(`⚠️ Found ${customers.length} customers, limiting to 1000`);
        }

        // Generate batch ID
        const batchId = `batch-${uuidv4()}`;

        // Return immediately and process in background
        res.json({
            success: true,
            message: "Bulk SMS job started",
            batchId: batchId,
            totalCustomers: limitedCustomers.length,
            journeyStage: journeyStage,
            journeyStageName: limitedCustomers[0]?.journey_stage_name || 'Unknown Stage',
            status: "processing"
        });

        // Process SMS in background (don't await - process asynchronously)
        processSMSBatch(limitedCustomers, batchId, campaignName, message, templateParams)
            .catch(error => {
                console.error('❌ Error processing SMS batch:', error);
            });

    } catch (error) {
        console.error("Error creating bulk SMS job:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create bulk SMS job",
            error: error.message
        });
    }
});

/**
 * Process SMS batch asynchronously
 */
async function processSMSBatch(customers, batchId, campaignName, message, templateParams) {
    const results = {
        sent: 0,
        failed: 0,
        total: customers.length
    };

    // Process with a small delay between SMS to avoid rate limiting (10 SMS per second)
    const DELAY_BETWEEN_SMS = 100; // 100ms = 10 SMS/second

    for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        
        try {
            // Prepare customer name
            const customerName = [
                customer.cp_first_name || '',
                customer.cp_sur_name || ''
            ].filter(Boolean).join(' ') || 'Customer';

            // Prepare template params
            let processedTemplateParams = templateParams || [];
            if (processedTemplateParams.length > 0) {
                processedTemplateParams = processedTemplateParams.map(param => {
                    return param
                        .replace('{FirstName}', customer.cp_first_name || 'Customer')
                        .replace('{LastName}', customer.cp_sur_name || '')
                        .replace('{FullName}', customerName)
                        .replace('{StageName}', customer.journey_stage_name || '');
                });
            }

            // Create log entry first
            const smsLog = await SmsLog.create({
                customer_id: customer.cp_id,
                phone_number: customer.cp_mobile,
                customer_name: customerName,
                message: message,
                campaign_name: campaignName,
                template_params: processedTemplateParams,
                journey_stage: customer.cp_journey_stage,
                journey_stage_name: customer.journey_stage_name,
                batch_id: batchId,
                status: 'pending'
            });

            // Send SMS
            const result = await sendSMSViaAiSensy({
                destination: customer.cp_mobile,
                campaignName: campaignName,
                templateParams: processedTemplateParams,
                customerName: customerName
            });

            // Update log based on result
            if (result.success) {
                await SmsLog.updateOne(
                    { _id: smsLog._id },
                    {
                        status: 'sent',
                        sent_at: new Date(),
                        aisensy_message_id: result.messageId,
                        aisensy_response: result.response
                    }
                );
                results.sent++;
            } else {
                await SmsLog.updateOne(
                    { _id: smsLog._id },
                    {
                        status: 'failed',
                        failed_at: new Date(),
                        error_message: result.error,
                        error_code: result.statusCode?.toString(),
                        aisensy_response: result.response
                    }
                );
                results.failed++;
            }

            // Log progress every 100 customers
            if ((i + 1) % 100 === 0) {
                console.log(`📊 Progress: ${i + 1}/${customers.length} SMS processed`);
            }

        } catch (error) {
            console.error(`❌ Error sending SMS to customer ${customer.cp_id}:`, error.message);
            
            // Create failed log entry
            try {
                await SmsLog.create({
                    customer_id: customer.cp_id,
                    phone_number: customer.cp_mobile,
                    customer_name: customer.cp_first_name || 'Customer',
                    message: message,
                    campaign_name: campaignName,
                    template_params: templateParams || [],
                    journey_stage: customer.cp_journey_stage,
                    journey_stage_name: customer.journey_stage_name,
                    batch_id: batchId,
                    status: 'failed',
                    failed_at: new Date(),
                    error_message: error.message
                });
            } catch (logError) {
                console.error('❌ Error creating SMS log:', logError);
            }
            
            results.failed++;
        }

        // Add delay between SMS to avoid rate limiting
        if (i < customers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SMS));
        }
    }

    console.log(`✅ Batch ${batchId} completed: ${results.sent} sent, ${results.failed} failed`);
    return results;
}

/**
 * @swagger
 * /api/customers/sms-status/{batchId}:
 *   get:
 *     summary: Get SMS sending status for a batch
 *     tags: [Customers]
 */
router.get("/sms-status/:batchId", async (req, res) => {
    try {
        const { batchId } = req.params;

        // Get status from MongoDB
        const stats = await SmsLog.aggregate([
            { $match: { batch_id: batchId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusCounts = {
            pending: 0,
            sent: 0,
            failed: 0
        };

        stats.forEach(stat => {
            statusCounts[stat._id] = stat.count;
        });

        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        const successRate = total > 0 ? ((statusCounts.sent / total) * 100).toFixed(2) : 0;

        // Get journey stage breakdown
        const journeyStageStats = await SmsLog.aggregate([
            { $match: { batch_id: batchId } },
            {
                $group: {
                    _id: {
                        stage: '$journey_stage',
                        stageName: '$journey_stage_name'
                    },
                    total: { $sum: 1 },
                    sent: {
                        $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
                    },
                    failed: {
                        $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                    }
                }
            },
            { $sort: { '_id.stage': 1 } }
        ]);

        res.json({
            success: true,
            batchId: batchId,
            total: total,
            status: statusCounts,
            successRate: `${successRate}%`,
            journeyStageBreakdown: journeyStageStats.map(stat => ({
                stage: stat._id.stage,
                stageName: stat._id.stageName,
                total: stat.total,
                sent: stat.sent,
                failed: stat.failed
            }))
        });

    } catch (error) {
        console.error("Error fetching SMS status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch SMS status",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/customers/sms-logs:
 *   get:
 *     summary: Get SMS logs with filters
 *     tags: [Customers]
 */
router.get("/sms-logs", async (req, res) => {
    try {
        const { 
            batchId, 
            status, 
            customerId,
            journeyStage,
            phoneNumber,
            startDate,
            endDate,
            page = 1,
            limit = 50
        } = req.query;

        const query = {};
        
        if (batchId) query.batch_id = batchId;
        if (status) query.status = status;
        if (customerId) query.customer_id = parseInt(customerId);
        if (journeyStage) query.journey_stage = parseInt(journeyStage);
        if (phoneNumber) query.phone_number = phoneNumber;
        
        if (startDate || endDate) {
            query.created_at = {};
            if (startDate) query.created_at.$gte = new Date(startDate);
            if (endDate) query.created_at.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await SmsLog.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await SmsLog.countDocuments(query);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Error fetching SMS logs:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch SMS logs",
            error: error.message
        });
    }
});

// Get customers created within the last 3 calendar days (inclusive)
router.get('/recent/three-days', async (req, res) => {
    try {
        const now = new Date();
        const fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - 2); // include today and previous 2 days
        fromDate.setHours(0, 0, 0, 0);

        const query = `
            SELECT *
            FROM customer_profile
            WHERE cp_created_at >= ?
            ORDER BY cp_created_at DESC
        `;

        const customers = await executeQuery(query, [fromDate]);

        res.json({
            success: true,
            count: customers.length,
            range: {
                from: fromDate,
                to: now
            },
            data: customers
        });
    } catch (error) {
        console.error('Error fetching recent customers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customers from the last three days',
            error: error.message
        });
    }
});

// Get customers within last three days filtered by journey stage
router.get('/recent/three-days/stage/:stageId', async (req, res) => {
    const { stageId } = req.params;

    if (!stageId) {
        return res.status(400).json({
            success: false,
            message: 'stageId parameter is required'
        });
    }

    try {
        const now = new Date();
        const fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - 2); // include today and previous 2 days
        fromDate.setHours(0, 0, 0, 0);

        const query = `
            SELECT *
            FROM customer_profile
            WHERE cp_created_at >= ?
              AND cp_journey_stage = ?
            ORDER BY cp_created_at DESC
        `;

        const customers = await executeQuery(query, [fromDate, stageId]);

        res.json({
            success: true,
            count: customers.length,
            range: {
                from: fromDate,
                to: now
            },
            stageId,
            data: customers
        });
    } catch (error) {
        console.error('Error fetching recent customers by stage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customers from the last three days for the specified stage',
            error: error.message
        });
    }
});

// Send SMS and WhatsApp messages to specific customers by customer_profile IDs
router.post('/notifications/send', async (req, res) => {
    const { customerIds = [], messageTemplate, whatsappCampaignName = 'Missing Document', source = 'bulk-notification' } = req.body || {};

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'customerIds array is required'
        });
    }

    try {
        const placeholders = customerIds.map(() => '?').join(',');
        const query = `
            SELECT cp_id, cp_first_name, cp_sur_name, cp_mobile
            FROM customer_profile
            WHERE cp_id IN (${placeholders})
              AND cp_mobile IS NOT NULL
              AND cp_mobile <> ''
        `;

        const customers = await executeQuery(query, customerIds);

        if (!customers || customers.length === 0) {
            return res.json({
                success: true,
                message: 'No customers found for provided IDs',
                results: []
            });
        }

        const normalizePhone = (mobile) => {
            if (!mobile) return null;
            let digits = String(mobile).replace(/\D/g, '');
            if (digits.length === 10) {
                digits = `91${digits}`;
            }
            if (digits.length === 12 && digits.startsWith('91')) {
                return digits;
            }
            return digits.length >= 10 ? digits : null;
        };

        const defaultMessage = (name) => `Hi ${name || 'Customer'}, your application is almost ready! Please upload the remaining documents to complete your application process. Upload now: https://salary4sure.com/app Thank you for choosing Salary4Sure — Team Salary4Sure`;

        const results = [];
        const requestBatchId = `single-${uuidv4()}`;

        for (const customer of customers) {
            const phone = normalizePhone(customer.cp_mobile);
            if (!phone) {
                results.push({
                    cp_id: customer.cp_id,
                    status: 'failed',
                    reason: 'Invalid mobile number'
                });
                continue;
            }

            const firstName = customer.cp_first_name || customer.cp_sur_name || 'Customer';
            const smsMessage = messageTemplate || defaultMessage(firstName);

            const whatsappPayload = {
                destination: phone,
                campaignName: whatsappCampaignName,
                userName: 'SALARY4SURE',
                templateParams: [firstName, `${customer.cp_id}`],
                source,
                paramsFallbackValue: {
                    FirstName: firstName,
                    CustomerId: `${customer.cp_id}`
                }
            };

            const entry = {
                cp_id: customer.cp_id,
                phone,
                firstName,
                sms: null,
                whatsapp: null
            };

            let smsLog = null;
            try {
                smsLog = await SmsLog.create({
                    customer_id: customer.cp_id,
                    phone_number: phone,
                    customer_name: firstName,
                    campaign_name: whatsappCampaignName,
                    message: smsMessage,
                    template_params: [],
                    batch_id: requestBatchId,
                    status: 'pending',
                    channel: 'sms',
                    provider: 'SMS24',
                    source,
                    request_payload: {
                        mobile: phone,
                        message: smsMessage
                    }
                });

                const smsResponse = await sendTransactionalSms({
                    mobile: customer.cp_mobile,
                    message: smsMessage
                });

                await SmsLog.updateOne(
                    { _id: smsLog._id },
                    {
                        status: 'sent',
                        sent_at: new Date(),
                        response_payload: smsResponse,
                        message_id: smsResponse?.messageid || smsResponse?.messageId || null,
                        provider: 'SMS24'
                    }
                );

                entry.sms = {
                    status: 'sent',
                    response: smsResponse,
                    logId: smsLog._id
                };
            } catch (error) {
                if (smsLog) {
                    await SmsLog.updateOne(
                        { _id: smsLog._id },
                        {
                            status: 'failed',
                            failed_at: new Date(),
                            error_message: error.message,
                            response_payload: error.original?.response?.data || null
                        }
                    );
                } else {
                    smsLog = await SmsLog.create({
                        customer_id: customer.cp_id,
                        phone_number: phone,
                        customer_name: firstName,
                        campaign_name: whatsappCampaignName,
                        message: smsMessage,
                        template_params: [],
                        batch_id: requestBatchId,
                        status: 'failed',
                        channel: 'sms',
                        provider: 'SMS24',
                        source,
                        error_message: error.message,
                        failed_at: new Date()
                    });
                }

                entry.sms = {
                    status: 'failed',
                    error: error.message,
                    logId: smsLog._id
                };
            }

            let whatsappLog = null;
            try {
                whatsappLog = await SmsLog.create({
                    customer_id: customer.cp_id,
                    phone_number: phone,
                    customer_name: firstName,
                    campaign_name: whatsappCampaignName,
                    message: smsMessage,
                    template_params: whatsappPayload.templateParams,
                    batch_id: requestBatchId,
                    status: 'pending',
                    channel: 'whatsapp',
                    provider: 'AiSensy',
                    source,
                    request_payload: whatsappPayload
                });

                const whatsappResponse = await sendWhatsappMessage(whatsappPayload);

                await SmsLog.updateOne(
                    { _id: whatsappLog._id },
                    {
                        status: 'sent',
                        sent_at: new Date(),
                        response_payload: whatsappResponse,
                        message_id: whatsappResponse?.messageId || whatsappResponse?.data?.messageId || null,
                        provider: 'AiSensy',
                        aisensy_response: whatsappResponse,
                        aisensy_message_id: whatsappResponse?.messageId || null
                    }
                );

                entry.whatsapp = {
                    status: 'sent',
                    response: whatsappResponse,
                    logId: whatsappLog._id
                };
            } catch (error) {
                if (whatsappLog) {
                    await SmsLog.updateOne(
                        { _id: whatsappLog._id },
                        {
                            status: 'failed',
                            failed_at: new Date(),
                            error_message: error.message,
                            response_payload: error.original?.response?.data || null,
                            aisensy_response: error.original?.response?.data || null
                        }
                    );
                } else {
                    whatsappLog = await SmsLog.create({
                        customer_id: customer.cp_id,
                        phone_number: phone,
                        customer_name: firstName,
                        campaign_name: whatsappCampaignName,
                        message: smsMessage,
                        template_params: whatsappPayload.templateParams,
                        batch_id: requestBatchId,
                        status: 'failed',
                        channel: 'whatsapp',
                        provider: 'AiSensy',
                        source,
                        error_message: error.message,
                        failed_at: new Date()
                    });
                }

                entry.whatsapp = {
                    status: 'failed',
                    error: error.message,
                    logId: whatsappLog._id
                };
            }

            results.push(entry);
        }

        res.json({
            success: true,
            batchId: requestBatchId,
            total: results.length,
            results
        });

    } catch (error) {
        console.error('Error sending notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notifications',
            error: error.message
        });
    }
});




// Send SMS and WhatsApp messages to all customer within 3day and are not rejectd also not on thank you 
router.post('/notifications/send/all', async (req, res) => {

    // stageIds is an array of stage ids in string format
    let stageIds = req.body.stageIds || [];

    console.log(stageIds);


    if (!stageIds.length) {
        return res.status(400).json({
            success: false,
            message: "stageIds cannot be empty"
        });
    }

    const { messageTemplate, whatsappCampaignName = 'Missing Document', source = 'bulk-notification' } = req.body || {};

    if (!messageTemplate || !whatsappCampaignName || !source) {
        return res.status(400).json({
            success: false,
            message: 'messageTemplate, whatsappCampaignName, and source are required'
        });
    }

   

    try {
    
//         const query = `
//             SELECT cp_id, cp_first_name, cp_sur_name, cp_mobile
// FROM customer_profile
// WHERE cp_mobile IS NOT NULL
//   AND cp_mobile <> ''
//   AND DATE(created_at) >= DATE(NOW() - INTERVAL 3 DAY)
//   AND cp_journey_stage IN (${stageIds.join(',')}); 
//         `;

//         const customers = await executeQuery(query,[]);

const placeholders = stageIds.map(() => '?').join(',');
const query = `
  SELECT cp_id, cp_first_name, cp_sur_name, cp_mobile
  FROM customer_profile
  WHERE cp_mobile IS NOT NULL
    AND cp_mobile <> ''
    AND DATE(cp_created_at) >= DATE(NOW() - INTERVAL 3 DAY)
    AND cp_journey_stage IN (${placeholders});
`;

const customers = await executeQuery(query, stageIds);


        if (!customers || customers.length === 0) {
            return res.json({
                success: true,
                message: 'No customers found for provided IDs',
                results: []
            });
        }

        const normalizePhone = (mobile) => {
            if (!mobile) return null;
            let digits = String(mobile).replace(/\D/g, '');
            if (digits.length === 10) {
                digits = `91${digits}`;
            }
            if (digits.length === 12 && digits.startsWith('91')) {
                return digits;
            }
            return digits.length >= 10 ? digits : null;
        };

        const defaultMessage = (name) => `Hi ${name || 'Customer'}, your application is almost ready! Please upload the remaining documents to complete your application process. Upload now: https://salary4sure.com/app Thank you for choosing Salary4Sure — Team Salary4Sure`;

        const results = [];
        const requestBatchId = `single-${uuidv4()}`;

        for (const customer of customers) {
            const phone = normalizePhone(customer.cp_mobile);
            if (!phone) {
                results.push({
                    cp_id: customer.cp_id,
                    status: 'failed',
                    reason: 'Invalid mobile number'
                });
                continue;
            }

            const firstName = customer.cp_first_name || customer.cp_sur_name || 'Customer';
            const smsMessage = messageTemplate || defaultMessage(firstName);

            const whatsappPayload = {
                destination: phone,
                campaignName: whatsappCampaignName,
                userName: 'SALARY4SURE',
                templateParams: [firstName, `${customer.cp_id}`],
                source,
                paramsFallbackValue: {
                    FirstName: firstName,
                    CustomerId: `${customer.cp_id}`
                }
            };

            const entry = {
                cp_id: customer.cp_id,
                phone,
                firstName,
                sms: null,
                whatsapp: null
            };

            let smsLog = null;
            try {
                smsLog = await SmsLog.create({
                    customer_id: customer.cp_id,
                    phone_number: phone,
                    customer_name: firstName,
                    campaign_name: whatsappCampaignName,
                    message: smsMessage,
                    template_params: [],
                    batch_id: requestBatchId,
                    status: 'pending',
                    channel: 'sms',
                    provider: 'SMS24',
                    source,
                    request_payload: {
                        mobile: phone,
                        message: smsMessage
                    }
                });

                const smsResponse = 
                // null;
                await sendTransactionalSms({
                    mobile: customer.cp_mobile,
                    message: smsMessage
                });

                await SmsLog.updateOne(
                    { _id: smsLog._id },
                    {
                        status: 'sent',
                        sent_at: new Date(),
                        response_payload: smsResponse,
                        message_id: smsResponse?.messageid || smsResponse?.messageId || null,
                        provider: 'SMS24'
                    }
                );

                entry.sms = {
                    status: 'sent',
                    response: smsResponse,
                    logId: smsLog._id
                };
            } catch (error) {
                if (smsLog) {
                    await SmsLog.updateOne(
                        { _id: smsLog._id },
                        {
                            status: 'failed',
                            failed_at: new Date(),
                            error_message: error.message,
                            response_payload: error.original?.response?.data || null
                        }
                    );
                } else {
                    smsLog = await SmsLog.create({
                        customer_id: customer.cp_id,
                        phone_number: phone,
                        customer_name: firstName,
                        campaign_name: whatsappCampaignName,
                        message: smsMessage,
                        template_params: [],
                        batch_id: requestBatchId,
                        status: 'failed',
                        channel: 'sms',
                        provider: 'SMS24',
                        source,
                        error_message: error.message,
                        failed_at: new Date()
                    });
                }

                entry.sms = {
                    status: 'failed',
                    error: error.message,
                    logId: smsLog._id
                };
            }

            let whatsappLog = null;
            try {
                whatsappLog = await SmsLog.create({
                    customer_id: customer.cp_id,
                    phone_number: phone,
                    customer_name: firstName,
                    campaign_name: whatsappCampaignName,
                    message: smsMessage,
                    template_params: whatsappPayload.templateParams,
                    batch_id: requestBatchId,
                    status: 'pending',
                    channel: 'whatsapp',
                    provider: 'AiSensy',
                    source,
                    request_payload: whatsappPayload
                });

                const whatsappResponse = 
                // null;
                await sendWhatsappMessage(whatsappPayload);

                await SmsLog.updateOne(
                    { _id: whatsappLog._id },
                    {
                        status: 'sent',
                        sent_at: new Date(),
                        response_payload: whatsappResponse,
                        message_id: whatsappResponse?.messageId || whatsappResponse?.data?.messageId || null,
                        provider: 'AiSensy',
                        aisensy_response: whatsappResponse,
                        aisensy_message_id: whatsappResponse?.messageId || null
                    }
                );

                entry.whatsapp = {
                    status: 'sent',
                    response: whatsappResponse,
                    logId: whatsappLog._id
                };
            } catch (error) {
                if (whatsappLog) {
                    await SmsLog.updateOne(
                        { _id: whatsappLog._id },
                        {
                            status: 'failed',
                            failed_at: new Date(),
                            error_message: error.message,
                            response_payload: error.original?.response?.data || null,
                            aisensy_response: error.original?.response?.data || null
                        }
                    );
                } else {
                    whatsappLog = await SmsLog.create({
                        customer_id: customer.cp_id,
                        phone_number: phone,
                        customer_name: firstName,
                        campaign_name: whatsappCampaignName,
                        message: smsMessage,
                        template_params: whatsappPayload.templateParams,
                        batch_id: requestBatchId,
                        status: 'failed',
                        channel: 'whatsapp',
                        provider: 'AiSensy',
                        source,
                        error_message: error.message,
                        failed_at: new Date()
                    });
                }

                entry.whatsapp = {
                    status: 'failed',
                    error: error.message,
                    logId: whatsappLog._id
                };
            }

            results.push(entry);
        }

        res.json({
            success: true,
            batchId: requestBatchId,
            total: results.length,
            results
        });

    } catch (error) {
        console.error('Error sending notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notifications',
            error: error.message
        });
    }
});



// Send SMS and WhatsApp messages to specific customers by customer_profile IDs BY STAGE ID
// router.post('/notifications/send/stage/:stageId', async (req, res) => {
//     const { stageId } = req.params;
//     const { customerIds = [], messageTemplate, whatsappCampaignName = 'Missing Document', source = 'bulk-notification' } = req.body || {};

//     if (!Array.isArray(customerIds) || customerIds.length === 0) {
//         return res.status(400).json({
//             success: false,
//             message: 'customerIds array is required'
//         });
//     }

//     try {
//         const placeholders = customerIds.map(() => '?').join(',');
//         const query = `
//             SELECT cp_id, cp_first_name, cp_sur_name, cp_mobile
//             FROM customer_profile
//             WHERE cp_id IN (${placeholders})
//               AND cp_mobile IS NOT NULL
//               AND cp_mobile <> ''
//         `;

//         const customers = await executeQuery(query, customerIds);

//         if (!customers || customers.length === 0) {
//             return res.json({
//                 success: true,
//                 message: 'No customers found for provided IDs',
//                 results: []
//             });
//         }

//         const normalizePhone = (mobile) => {
//             if (!mobile) return null;
//             let digits = String(mobile).replace(/\D/g, '');
//             if (digits.length === 10) {
//                 digits = `91${digits}`;
//             }
//             if (digits.length === 12 && digits.startsWith('91')) {
//                 return digits;
//             }
//             return digits.length >= 10 ? digits : null;
//         };

//         const defaultMessage = (name) => `Hi ${name || 'Customer'}, your application is almost ready! Please upload the remaining documents to complete your application process. Upload now: https://salary4sure.com/app Thank you for choosing Salary4Sure — Team Salary4Sure`;

//         const results = [];

//         for (const customer of customers) {
//             const phone = normalizePhone(customer.cp_mobile);
//             if (!phone) {
//                 results.push({
//                     cp_id: customer.cp_id,
//                     status: 'failed',
//                     reason: 'Invalid mobile number'
//                 });
//                 continue;
//             }

//             const firstName = customer.cp_first_name || customer.cp_sur_name || 'Customer';
//             const smsMessage = messageTemplate || defaultMessage(firstName);

//             const whatsappPayload = {
//                 destination: phone,
//                 campaignName: whatsappCampaignName,
//                 userName: 'SALARY4SURE',
//                 templateParams: [firstName, firstName],
//                 source,
//                 paramsFallbackValue: {
//                     FirstName: firstName
//                 }
//             };

//             const entry = {
//                 cp_id: customer.cp_id,
//                 phone,
//                 firstName,
//                 sms: null,
//                 whatsapp: null
//             };

//             try {
//                 entry.sms = await sendTransactionalSms({
//                     mobile: phone,
//                     message: smsMessage
//                 });
//             } catch (error) {
//                 entry.sms = {
//                     status: 'failed',
//                     error: error.message
//                 };
//             }

//             try {
//                 entry.whatsapp = await sendWhatsappMessage(whatsappPayload);
//             } catch (error) {
//                 entry.whatsapp = {
//                     status: 'failed',
//                     error: error.message
//                 };
//             }

//             results.push(entry);
//         }

//         res.json({
//             success: true,
//             total: results.length,
//             results
//         });

//     } catch (error) {
//         console.error('Error sending notifications:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to send notifications',
//             error: error.message
//         });
//     }
// });

export default router;
