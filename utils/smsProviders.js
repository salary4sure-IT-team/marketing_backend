import axios from 'axios';

const SMS24_BASE_URL = 'https://smpp1.sms24hours.com/SMSApi/send';
const SMS24_DEFAULTS = {
    userid: 'Salary4SureOTP',
    password: 'YtC5UYnf',
    sendMethod: 'quick',
    senderid: 'SLRYFS',
    msgType: 'text',
    duplicatecheck: 'true',
    output: 'json'
};

export async function sendTransactionalSms({ mobile, message, dltEntityId = '', dltTemplateId = '1707176232483592654' }) {
    if (!mobile || !message) {
        throw new Error('mobile and message are required for SMS');
    }

    const params = {
        ...SMS24_DEFAULTS,
        mobile,
        msg: message,
        dltEntityId,
        dltTemplateId
    };

    const url = new URL(SMS24_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    });

    try {
        const response = await axios.get(url.toString(), {
            headers: {
                Cookie: 'SERVERID=webC1'
            }
        });
        return response.data;
    } catch (error) {
        const err = new Error('SMS API request failed');
        err.original = error;
        throw err;
    }
}

const AISENSY_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
const AISENSY_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4OTE5YTI5MTU0YTU3MGMwZDMyMTdhZCIsIm5hbWUiOiJTQUxBUlk0U1VSRSIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2ODdmNTNkNTk0OTUwYzBjMGEyOTc5ZWMiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzU0MzcyNjQ5fQ.yzCbaZUtKDYOel6Bb0BLWNZ7dIAuxrFfQAwVo7WDY_c';

export async function sendWhatsappMessage({ destination, campaignName, templateParams = [], source, userName = 'SALARY4SURE', media = {}, buttons = [], carouselCards = [], location = {}, attributes = {}, paramsFallbackValue = {} }) {
    if (!destination || !campaignName) {
        throw new Error('destination and campaignName are required for WhatsApp message');
    }

    const payload = {
        apiKey: AISENSY_API_KEY,
        campaignName,
        destination,
        userName,
        templateParams,
        source,
        media,
        buttons,
        carouselCards,
        location,
        attributes,
        paramsFallbackValue
    };

    try {
        const response = await axios.post(AISENSY_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        const err = new Error('AiSensy WhatsApp API request failed');
        err.original = error;
        throw err;
    }
}
