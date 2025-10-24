import express from "express";
import { executeQuery } from "../config/mysqlDb.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: API for fetching various reports and statistics
 */

/**
 * @swagger
 * /api/reports/leads:
 *   get:
 *     summary: Get total and quality leads within a date range
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-01-01
 *         required: true
 *         description: Start date for the report (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-12-31
 *         required: true
 *         description: End date for the report (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lead report retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalLeads:
 *                   type: integer
 *                   description: Total number of leads in the specified date range
 *                   example: 963
 *                 qualityLeads:
 *                   type: integer
 *                   description: Number of quality leads based on criteria
 *                   example: 173
 *                 conversionRate:
 *                   type: number
 *                   description: Conversion rate percentage
 *                   example: 18.0
 *       400:
 *         description: Invalid date format or missing dates
 *       500:
 *         description: Server error
 */
router.get("/leads", async (req, res) => {
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

        // Query for total leads within date range
        const totalLeadsQuery = `
            SELECT COUNT(*) as total 
            FROM leads 
            WHERE DATE(created_on) BETWEEN ? AND ? 
        `;
        
        const [totalLeadsResult] = await executeQuery(totalLeadsQuery, [startDate, endDate]);
        console.log(totalLeadsResult);
        const totalLeads = totalLeadsResult?.total || 0;


        // Query for total marketing leads
        // Query for total leads within date range
        const totalMarketingLeadsQuery = `
            SELECT COUNT(*) as total 
            FROM leads 
            WHERE DATE(created_on) BETWEEN ? AND ? AND utm_campaign = '120237694055210170'
        `;
        
        const [totalMarketingLeadsResult] = await executeQuery(totalMarketingLeadsQuery, [startDate, endDate]);
        console.log(totalMarketingLeadsResult);
        const totalMarketingLeads = totalMarketingLeadsResult?.total || 0;

        // Query for quality leads
        // Quality leads: utm_campaign = '120237694055210170' AND monthly_salary_amount > 35000
        const qualityLeadsQuery = `
            SELECT COUNT(*) as quality 
            FROM leads 
            WHERE DATE(created_on) BETWEEN ? AND ?
            AND utm_campaign = ?
            AND monthly_salary_amount > ?
        `;
        
        const utmCampaignId = "120237694055210170";
        const minSalary = 35000;
        
        const [qualityLeadsResult] = await executeQuery(qualityLeadsQuery, [
            startDate, 
            endDate, 
            utmCampaignId, 
            minSalary
        ]);
        
        const qualityLeads = qualityLeadsResult?.quality || 0;

        

        // Calculate conversion rate
        const conversionRate = totalLeads > 0 ? ((qualityLeads / totalLeads) * 100).toFixed(1) : 0;

        // Quaery for coversion leads which are disbursed
        const conversionLeadsQuery = `
            SELECT COUNT(*) as conversion 
            FROM leads 
            WHERE DATE(created_on) BETWEEN ? AND ?
            AND utm_campaign = ?
            AND monthly_salary_amount > ?
            AND status = 'DISBURSED'
        `;
        
        const [conversionLeadsResult] = await executeQuery(conversionLeadsQuery, [startDate, endDate, utmCampaignId, minSalary]);
        console.log(conversionLeadsResult);
        const conversionLeads = conversionLeadsResult?.conversion || 0;

        const sumLoanAmountQuery = `
  SELECT 
    SUM(loan_amount) AS total_loan_amount
  FROM leads
  WHERE DATE(created_on) BETWEEN ? AND ?
    AND utm_campaign = '120237694055210170';
`;

        const [sumLoanAmountResult] = await executeQuery(sumLoanAmountQuery, [startDate, endDate]);
        console.log(sumLoanAmountResult);
        const sumLoanAmount = sumLoanAmountResult?.total_loan_amount || 0;

        res.json({
            success: true,
            totalLeads,
            totalMarketingLeads,
            qualityLeads,
            conversionRate: parseFloat(conversionRate),
            conversionLeads,
            sumLoanAmount
        });

    } catch (error) {
        console.error("Error fetching lead report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch lead report",
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/reports/leads/stats:
 *   get:
 *     summary: Get lead statistics without date filter
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Lead statistics retrieved successfully
 */
router.get("/leads/stats", async (req, res) => {
    try {
        // Get total leads count
        const totalLeadsQuery = "SELECT COUNT(*) as total FROM leads";
        const [totalLeadsResult] = await executeQuery(totalLeadsQuery);
        const totalLeads = totalLeadsResult?.total || 0;

        // Get quality leads count
        const qualityLeadsQuery = `
            SELECT COUNT(*) as quality 
            FROM leads 
            WHERE utm_campaign = ? 
            AND monthly_salary_amount > ?
        `;
        
        const utmCampaignId = "120237694055210170";
        const minSalary = 35000;
        
        const [qualityLeadsResult] = await executeQuery(qualityLeadsQuery, [utmCampaignId, minSalary]);
        const qualityLeads = qualityLeadsResult?.quality || 0;

        // Calculate conversion rate
        const conversionRate = totalLeads > 0 ? ((qualityLeads / totalLeads) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            totalLeads,
            qualityLeads,
            conversionRate: parseFloat(conversionRate)
        });

    } catch (error) {
        console.error("Error fetching lead stats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch lead statistics",
            error: error.message
        });
    }
});

export default router;
