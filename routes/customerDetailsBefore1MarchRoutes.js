// Customer details before 1 march routes
import express from "express";
import { executeQuery } from "../config/mysqlDb.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const phoneNumber = req.query.phoneNumber;

        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false,
                message: "Phone number is required" 
            });
        }

        // Get all leads for this phone number with status
        const leadsQuery = `
            SELECT 
                lead_id,
                status,
                mobile,
                user_type
            FROM leads 
            WHERE mobile = ?
        `;
        const leadsData = await executeQuery(leadsQuery, [phoneNumber]);

        // Check if leads exist
        if (!leadsData || leadsData.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "No leads found for this phone number" 
            });
        }

        // Count number of loans (leads)
        const numberOfLoans = leadsData.length;

        // Get status from leads (if multiple leads, return array of statuses, or most recent)
        const statuses = leadsData.map(lead => lead.status);

        // Get user_type from leads
        // const userTypes = leadsData.map(lead => lead.user_type);
        // console.log(leadsData);
        // Get the most recent status or all unique statuses
        const uniqueStatuses = [...new Set(statuses)];

        // Return leads data with loan count and status
        res.json({
            success: true,
            number_of_loans: numberOfLoans,
            status: uniqueStatuses.length === 1 ? uniqueStatuses[0] : uniqueStatuses,
            leads: leadsData,
        });

    } catch (error) {
        console.error("Error fetching customer details before 1 march:", error);
        return res.status(500).json({ 
            success: false,
            message: "Internal server error",
            error: error.message 
        });
    }
});

export default router;