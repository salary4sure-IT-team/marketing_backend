import express from "express";
import { executeQuery } from "../config/mysqlDb.js";
import InstantFormLead from "../models/InstantFormLead.js";
// import ExcelUploadHistory from "../models/ExcelUploadHistory.js";

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
 *                 totalMarketingLeads:
 *                   type: integer
 *                   description: Total number of marketing leads (utm_campaign = '120237694055210170')
 *                   example: 335
 *                 qualityLeads:
 *                   type: integer
 *                   description: Number of quality leads based on criteria
 *                   example: 173
 *                 conversionRate:
 *                   type: number
 *                   description: Conversion rate percentage
 *                   example: 18.0
 *                 conversionLeads:
 *                   type: integer
 *                   description: Number of leads that were disbursed
 *                   example: 14
 *                 sumLoanAmount:
 *                   type: number
 *                   description: Sum of recommended amounts from loan table for marketing leads
 *                   example: 368882
 *                 totalInstantLeadFormData:
 *                   type: integer
 *                   description: Count of leads that exist in both MongoDB instantFormLead collection and MySQL customer_profile table (matched by phone number)
 *                   example: 25
 *                 instantLeadFormData:
 *                   type: object
 *                   description: Detailed breakdown of instant form lead matching
 *                   properties:
 *                     matched:
 *                       type: integer
 *                       description: Total count of matched leads in customer_profile
 *                       example: 25
 *                     unmatched:
 *                       type: integer
 *                       description: Total count of unmatched leads
 *                       example: 15
 *                     newlyMatched:
 *                       type: integer
 *                       description: Count of leads that were just matched in this API call
 *                       example: 3
 *                     total:
 *                       type: integer
 *                       description: Total instant form leads in the date range
 *                       example: 40
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
            WHERE DATE(created_on) BETWEEN ? AND ? AND utm_source = 'MARKETING'
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
            AND utm_source = 'MARKETING'
            AND monthly_salary_amount > ?
        `;
        
        const minSalary = 35000;
        
        const [qualityLeadsResult] = await executeQuery(qualityLeadsQuery, [
            startDate, 
            endDate, 
            // utmCampaignId, 
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
            AND utm_source = 'MARKETING'
            AND monthly_salary_amount > ?
            AND status = 'DISBURSED'
        `;
        
        const [conversionLeadsResult] = await executeQuery(conversionLeadsQuery, [startDate, endDate, minSalary]);
        console.log(conversionLeadsResult);
        const conversionLeads = conversionLeadsResult?.conversion || 0;

        const sumLoanAmountQuery = `
  SELECT 
    SUM(l.recommended_amount) AS total_loan_amount
  FROM leads le
  LEFT JOIN loan l ON le.lead_id = l.lead_id
  WHERE DATE(le.created_on) BETWEEN ? AND ?
    AND le.utm_source = 'MARKETING';
`;

        const [sumLoanAmountResult] = await executeQuery(sumLoanAmountQuery, [startDate, endDate]);
        console.log(sumLoanAmountResult);
        const sumLoanAmount = sumLoanAmountResult?.total_loan_amount || 0;

        // Query for instant form leads within date range and re-check unmatched leads
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999); // Set to end of day

        // Get all instant form leads within date range
        const instantLeads = await InstantFormLead.find({
            uploaded_at: {
                $gte: startDateObj,
                $lte: endDateObj
            },
            phone_number: { $exists: true, $ne: null, $ne: '' }
        }).select('phone_number matched_in_customer_profile _id');

        // Extract unique phone numbers
        const phoneNumbers = [...new Set(instantLeads.map(lead => lead.phone_number).filter(phone => phone))];

        // Get unmatched leads to re-check
        const unmatchedLeads = instantLeads.filter(lead => !lead.matched_in_customer_profile);
        const unmatchedPhoneNumbers = [...new Set(unmatchedLeads.map(lead => lead.phone_number).filter(phone => phone))];

        let totalInstantLeadFormData = 0;
        let newlyMatchedCount = 0;

        // Re-check unmatched leads against customer_profile
        if (unmatchedPhoneNumbers.length > 0) {
            const placeholders = unmatchedPhoneNumbers.map(() => '?').join(',');
            const matchingCustomersQuery = `
                SELECT DISTINCT cp_mobile 
                FROM customer_profile
                WHERE cp_mobile IN (${placeholders})
            `;
            
            const matchingCustomers = await executeQuery(matchingCustomersQuery, unmatchedPhoneNumbers);
            const newlyMatchedPhones = new Set(matchingCustomers.map(row => row.cp_mobile));

            // Update newly matched leads in MongoDB
            if (newlyMatchedPhones.size > 0) {
                const updateResult = await InstantFormLead.updateMany(
                    {
                        phone_number: { $in: Array.from(newlyMatchedPhones) },
                        matched_in_customer_profile: false
                    },
                    {
                        $set: {
                            matched_in_customer_profile: true,
                            matched_at: new Date()
                        }
                    }
                );
                newlyMatchedCount = updateResult.modifiedCount;
                console.log(`✅ Updated ${newlyMatchedCount} newly matched leads in MongoDB`);
            }
        }

        // Get total matched count (including previously matched and newly matched)
        const allPhoneNumbers = phoneNumbers.length > 0 ? phoneNumbers : [];
        if (allPhoneNumbers.length > 0) {
            const placeholders = allPhoneNumbers.map(() => '?').join(',');
            const countQuery = `
                SELECT COUNT(DISTINCT cp_mobile) as count
                FROM customer_profile
                WHERE cp_mobile IN (${placeholders})
            `;
            
            const [countResult] = await executeQuery(countQuery, allPhoneNumbers);
            totalInstantLeadFormData = countResult?.count || 0;
        }

        // Get final matched and unmatched counts
        const finalMatchedLeads = await InstantFormLead.countDocuments({
            created_time : {
                $gte: startDateObj,
                $lte: endDateObj
            },
            phone_number: { $exists: true, $ne: null, $ne: '' },
            matched_in_customer_profile: true
        });

        const finalUnmatchedLeads = await InstantFormLead.countDocuments({
            created_time : {
                $gte: startDateObj,
                $lte: endDateObj
            },
            phone_number: { $exists: true, $ne: null, $ne: '' },
            matched_in_customer_profile: false
        });

        

        // const mkins = await ExcelUploadHistory.find({
        //     created_at: {
        //         $gte: startDateObj,
        //         $lte: endDateObj
        //     },
        //     budget: { $exists: true, $ne: null, $ne: '' },
        //     sumofBudget: { $sum: "$budget" }
        // });
        // console.log(mkins);

        let qualityInstantFormLeadsCount = await InstantFormLead.countDocuments({
            matched_in_customer_profile: true,
            salary_numeric_value: { $gt: 35000 },
            uploaded_at: {
                $gte: startDateObj,
                $lte: endDateObj
            }
        });
        console.log(qualityInstantFormLeadsCount);

        
        res.json({
            success: true,
            totalLeads,
            totalMarketingLeads,
            qualityLeads,
            conversionRate: parseFloat(conversionRate),
            conversionLeads,
            sumLoanAmount,
            totalInstantLeadFormData,
            instantLeadFormData: {
                matched: finalMatchedLeads,
                unmatched: finalUnmatchedLeads,
                // newlyMatched: newlyMatchedCount,
                total: finalMatchedLeads + finalUnmatchedLeads
            },
            qualityInstantFormLeadsCount,
            // marketingCostInsights : mkins
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
        
        // const utmCampaignId = "120237694055210170";
        const minSalary = 35000;
        
        const [qualityLeadsResult] = await executeQuery(qualityLeadsQuery, [ minSalary]);
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


router.get("/leads/unmatched", async (req, res) => {
    try {

        const { startDate, endDate } = req.query;

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

        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999); // Set to end of day
        const unmatchedLeads = await InstantFormLead.find({
            matched_in_customer_profile: false,
            uploaded_at: {
                $gte: startDateObj,
                $lte: endDateObj
            },
            phone_number: { $exists: true, $ne: null, $ne: '' }
        });
        res.json({
            success: true,
            unmatchedLeads
        });
    } catch (error) {
        console.error("Error fetching unmatched leads:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch unmatched leads",
            error: error.message
        });
    }
});


/**
 * @swagger
 * /api/reports/leads/fresh-reloan:
 *   get:
 *     summary: Get fresh and reloan lead counts based on user_type
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
 *         description: Fresh and reloan counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 freshCount:
 *                   type: integer
 *                   description: Count of leads with user_type = 'NEW' (fresh cases)
 *                   example: 150
 *                 reloanCount:
 *                   type: integer
 *                   description: Count of leads with user_type = 'REPEAT' (reloan cases)
 *                   example: 75
 *                 totalLeads:
 *                   type: integer
 *                   description: Total leads in the date range
 *                   example: 225
 *       400:
 *         description: Invalid date format or missing dates
 *       500:
 *         description: Server error
 */
router.get("/leads/fresh-reloan", async (req, res) => {
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

        // Query for fresh leads (user_type = 'NEW')
        const freshCountQuery = `
            SELECT COUNT(*) as count
            FROM leads
            WHERE DATE(created_on) BETWEEN ? AND ?
              AND user_type = 'NEW'
        `;

        const [freshResult] = await executeQuery(freshCountQuery, [startDate, endDate]);
        const freshCount = freshResult?.count || 0;

        // Query for reloan leads (user_type = 'REPEAT')
        const reloanCountQuery = `
            SELECT COUNT(*) as count
            FROM leads
            WHERE DATE(created_on) BETWEEN ? AND ?
              AND user_type = 'REPEAT'
        `;

        const [reloanResult] = await executeQuery(reloanCountQuery, [startDate, endDate]);
        const reloanCount = reloanResult?.count || 0;

        // Optional: Get total leads for reference
        const totalLeadsQuery = `
            SELECT COUNT(*) as count
            FROM leads
            WHERE DATE(created_on) BETWEEN ? AND ?
        `;

        const [totalResult] = await executeQuery(totalLeadsQuery, [startDate, endDate]);
        const totalLeads = totalResult?.count || 0;

        res.json({
            success: true,
            freshCount,
            reloanCount,
            totalLeads,
            dateRange: {
                startDate,
                endDate
            }
        });

    } catch (error) {
        console.error("Error fetching fresh/reloan counts:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch fresh/reloan counts",
            error: error.message
        });
    }
});

router.get("/leads/disbursed-instant", async (req, res) => {
    try {
        const normalizePan = (pan) => {
            if (!pan) return null;
            return String(pan).trim().toUpperCase().replace(/\s+/g, "");
        };

        // Fetch all unique PAN numbers from InstantFormLead
        const instantFormLeads = await InstantFormLead.find({
            pan_number: { $exists: true, $ne: null, $ne: "" }
        }).select(
            "pan_number phone_number full_name email created_time platform what_is_your_monthly_salary matched_in_customer_profile quality_lead is_duplicate uploadHistoryId"
        ).lean();

        if (!instantFormLeads || instantFormLeads.length === 0) {
            return res.json({
                success: true,
                total: 0,
                disbursed_count: 0,
                disbursed: [],
                total_recommended_amount: 0
            });
        }

        // Build map PAN -> array of instant form leads
        const instantLeadsByPan = new Map();
        instantFormLeads.forEach(lead => {
            const normalizedPan = normalizePan(lead.pan_number);
            if (!normalizedPan) return;
            if (!instantLeadsByPan.has(normalizedPan)) {
                instantLeadsByPan.set(normalizedPan, []);
            }
            instantLeadsByPan.get(normalizedPan).push(lead);
        });

        const uniquePanNumbers = Array.from(instantLeadsByPan.keys());

        if (uniquePanNumbers.length === 0) {
            return res.json({
                success: true,
                total: instantFormLeads.length,
                disbursed_count: 0,
                disbursed: [],
                total_recommended_amount: 0
            });
        }

        // Fetch disbursed leads from MySQL that match these PAN numbers
        const placeholders = uniquePanNumbers.map(() => '?').join(',');
        const disbursedLeadsQuery = `
            SELECT 
                le.lead_id,
                le.pancard,
                le.mobile,
                le.created_on,
                le.utm_source,
                le.utm_campaign,
                le.monthly_salary_amount,
                ln.loan_id,
                COALESCE(ln.recommended_amount, 0) AS recommended_amount
            FROM leads le
            LEFT JOIN loan ln ON le.lead_id = ln.lead_id
            WHERE le.status = 'DISBURSED'
              AND le.pancard IS NOT NULL
              AND le.pancard != ''
              AND UPPER(TRIM(CONVERT(le.pancard USING utf8mb4))) IN (${placeholders})
        `;

        const disbursedLeads = await executeQuery(disbursedLeadsQuery, uniquePanNumbers);

        if (!disbursedLeads || disbursedLeads.length === 0) {
            return res.json({
                success: true,
                total: instantFormLeads.length,
                disbursed_count: 0,
                disbursed: [],
                total_recommended_amount: 0
            });
        }

        let totalRecommendedAmount = 0;

        const disbursed = disbursedLeads.map(lead => {
            const normalizedPan = normalizePan(lead.pancard);
            const matchingInstantLeads = normalizedPan ? (instantLeadsByPan.get(normalizedPan) || []) : [];

            const recommendedAmount = Number(lead.recommended_amount) || 0;
            totalRecommendedAmount += recommendedAmount;

            return {
                lead_id: lead.lead_id,
                loan_id: lead.loan_id,
                pancard: lead.pancard,
                normalized_pan: normalizedPan,
                mobile: lead.mobile,
                created_on: lead.created_on,
                recommended_amount: recommendedAmount,
                utm_source: lead.utm_source,
                utm_campaign: lead.utm_campaign,
                monthly_salary_amount: lead.monthly_salary_amount,
                instant_form_leads: matchingInstantLeads
            };
        });

        res.json({
            success: true,
            total: instantFormLeads.length,
            disbursed_count: disbursed.length,
            total_recommended_amount: totalRecommendedAmount,
            disbursed
        });

    } catch (error) {
        console.error("Error fetching disbursed instant matches:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch disbursed instant matches",
            error: error.message
        });
    }
});

// Get marketing leads for specific utm_campaigns within a date range
router.get('/leads/marketing-campaign', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required (format: YYYY-MM-DD)'
            });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({
                success: false,
                message: 'Date format must be YYYY-MM-DD'
            });
        }

        const campaigns = ['120237694054960170', '120239093541620170'];
        const placeholders = campaigns.map(() => '?').join(',');

        const query = `
            SELECT *
            FROM leads
            WHERE DATE(created_on) BETWEEN ? AND ?
              AND utm_source = 'MARKETING'
              AND utm_campaign IN (${placeholders})
            ORDER BY created_on DESC
        `;

        const params = [startDate, endDate, ...campaigns];
        const leads = await executeQuery(query, params);

        res.json({
            success: true,
            count: leads.length,
            dateRange: {
                startDate,
                endDate
            },
            campaigns,
            data: leads
        });

    } catch (error) {
        console.error('Error fetching marketing campaign leads:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch marketing campaign leads',
            error: error.message
        });
    }
});


export default router;
