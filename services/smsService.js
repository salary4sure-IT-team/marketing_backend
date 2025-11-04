import axios from 'axios';

const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
const AISENSY_API_KEY = process.env.AISENSY_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4OTE5YTI5MTU0YTU3MGMwZDMyMTdhZCIsIm5hbWUiOiJTQUxBUlk0U1VSRSIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2ODdmNTNkNTk0OTUwYzBjMGEyOTc5ZWMiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzU0MzcyNjQ5fQ.yzCbaZUtKDYOel6Bb0BLWNZ7dIAuxrFfQAwVo7WDY_c';

/**
 * Send SMS using AiSensy API
 * @param {Object} params - SMS parameters
 * @param {string} params.destination - Phone number (with country code, e.g., "919199479407")
 * @param {string} params.campaignName - Campaign name
 * @param {Array<string>} params.templateParams - Template parameters array
 * @param {string} params.customerName - Customer name for fallback
 * @returns {Promise<Object>} Response from AiSensy API
 */
export async function sendSMSViaAiSensy({ destination, campaignName, templateParams, customerName }) {
    try {
        // Validate phone number
        if (!destination || destination.length < 10) {
            throw new Error('Invalid phone number');
        }

        // Ensure phone number starts with country code (91 for India)
        let phoneNumber = destination.toString().trim();
        if (!phoneNumber.startsWith('91')) {
            // Remove leading + or 0
            phoneNumber = phoneNumber.replace(/^\+?0?/, '');
            phoneNumber = '91' + phoneNumber;
        }

        // Prepare request payload
        const payload = {
            apiKey: AISENSY_API_KEY,
            campaignName: campaignName || 'Missing Document',
            destination: phoneNumber,
            userName: 'SALARY4SURE',
            templateParams: templateParams || [],
            source: 'new-landing-page form',
            media: {},
            buttons: [],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
                FirstName: customerName || 'Customer'
            }
        };

        // Make API call with timeout
        const response = await axios.post(AISENSY_API_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 seconds timeout
        });

        return {
            success: true,
            messageId: response.data?.messageId || response.data?.id || null,
            response: response.data,
            statusCode: response.status
        };

    } catch (error) {
        // Handle axios errors
        if (error.response) {
            // API returned error response
            return {
                success: false,
                error: error.response.data?.message || error.response.data?.error || 'Unknown error',
                statusCode: error.response.status,
                response: error.response.data
            };
        } else if (error.request) {
            // Request made but no response
            return {
                success: false,
                error: 'No response from AiSensy API',
                statusCode: null
            };
        } else {
            // Error in request setup
            return {
                success: false,
                error: error.message,
                statusCode: null
            };
        }
    }
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone) {
    if (!phone) return false;
    const cleaned = phone.toString().replace(/[\s\-+]/g, '');
    // Should be at least 10 digits (Indian format)
    return /^\d{10,}$/.test(cleaned);
}

