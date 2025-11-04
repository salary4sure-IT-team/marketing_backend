import express from "express";
import { executeQuery } from "../config/mysqlDb.js";

const router = express.Router();

/**
 * @swagger
 * /api/send-sms:
 *   post:
 *     summary: Send SMS
 *     tags: [Send SMS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:  
 *               phoneNumber:
 *                 type: string
 *                 description: The phone number to send the SMS to
 *               message:
 *                 type: string
 *                 description: The message to send to the phone number
 *     responses:
 *       200:
 *         description: SMS sent successfully
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        console.log(phoneNumber, message);
        res.json({
            success: true,
            message: "SMS sent successfully"
        });
    } catch (error) {
        console.error("Error sending SMS:", error);
        res.status(500).json({
            success: false,
            message: "Error sending SMS"
        });
    }
});

export default router;