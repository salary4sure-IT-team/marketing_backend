import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import InstantFormLead from '../models/InstantFormLead.js';

const router = express.Router();

// Middleware to handle JSON parsing errors for this route
router.use('/upload', (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('❌ JSON parsing error:', err.message);
        return res.status(400).json({
            success: false,
            message: 'Invalid request format. Please use multipart/form-data for file uploads',
            error: 'JSON parsing error - use multipart/form-data instead'
        });
    }
    next(err);
});

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'instant-leads-' + uniqueSuffix + '.xlsx');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log('📁 File received:', file.fieldname, file.originalname, file.mimetype);
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.match(/\.(xlsx|xls)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Maximum 5 files
    },
    onError: function (err, next) {
        console.error('❌ Multer error:', err.message);
        next(err);
    }
});

// POST /api/instant-leads/upload
router.post('/upload', (req, res, next) => {
    upload.any()(req, res, (err) => {
        if (err) {
            console.error('❌ Multer error:', err.message);
            return res.status(400).json({
                success: false,
                message: 'File upload error',
                error: err.message,
                code: err.code
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        // Log request details for debugging
        console.log('📁 Content-Type:', req.get('Content-Type'));
        console.log('📁 Request body fields:', Object.keys(req.body));
        console.log('📁 Request files:', req.files ? req.files.length : 'No files');
        
        // Check if request is multipart/form-data
        const contentType = req.get('Content-Type');
        if (!contentType || !contentType.includes('multipart/form-data')) {
            return res.status(400).json({
                success: false,
                message: 'Content-Type must be multipart/form-data for file uploads',
                receivedContentType: contentType
            });
        }
        
        // Find the Excel file from uploaded files
        let excelFile = null;
        if (req.files && req.files.length > 0) {
            excelFile = req.files.find(file => 
                file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                file.mimetype === 'application/vnd.ms-excel' ||
                file.originalname.match(/\.(xlsx|xls)$/)
            );
        }
        
        if (!excelFile) {
            return res.status(400).json({
                success: false,
                message: 'No Excel file uploaded. Please upload a .xlsx or .xls file'
            });
        }
        
        console.log('📁 Excel file found:', excelFile.fieldname, excelFile.originalname);

        const { uploadedBy } = req.body;
        
        // Read Excel file
        console.log('📁 File uploaded to:', excelFile.path);
        console.log('📁 File exists:', fs.existsSync(excelFile.path));
        
        let workbook, jsonData;
        try {
            workbook = xlsx.readFile(excelFile.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            jsonData = xlsx.utils.sheet_to_json(worksheet);
        } catch (fileError) {
            console.error('❌ Excel file reading error:', fileError);
            return res.status(400).json({
                success: false,
                message: 'Error reading Excel file',
                error: fileError.message
            });
        }

        if (jsonData.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Excel file is empty'
            });
        }

        console.log('📊 Excel data loaded:', jsonData.length, 'rows');
        console.log('📋 All headers found:', Object.keys(jsonData[0]));

        // Process each row
        const processedLeads = [];
        const duplicates = [];
        const errors = [];

        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            const rowNumber = i + 2; // Excel row number (accounting for header)

            try {
                // Extract ALL data from Excel row dynamically
                const leadData = extractAllFields(row, rowNumber);
                
                // Basic validation for required fields
                if (!leadData.phone_number || leadData.phone_number.length < 10) {
                    errors.push(`Row ${rowNumber}: Invalid phone number`);
                    continue;
                }

                // Check for duplicates
                const duplicateCheck = await checkForDuplicates(leadData);
                
                if (duplicateCheck.isDuplicate) {
                    leadData.is_duplicate = true;
                    leadData.duplicate_reason = duplicateCheck.reason;
                    leadData.original_lead_id = duplicateCheck.originalLeadId;
                    duplicates.push({
                        row: rowNumber,
                        phone: leadData.phone_number,
                        pan: leadData.pan_number,
                        reason: duplicateCheck.reason
                    });
                }

                // Store in MongoDB
                const savedLead = await InstantFormLead.create(leadData);
                processedLeads.push(savedLead);

                console.log(`✅ Row ${rowNumber}: Processed - Phone: ${leadData.phone_number}, Duplicate: ${leadData.is_duplicate}`);

            } catch (error) {
                errors.push(`Row ${rowNumber}: ${error.message}`);
                console.error(`❌ Row ${rowNumber} error:`, error.message);
            }
        }

        // Clean up uploaded files
        try {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                        console.log('🗑️ Uploaded file cleaned up:', file.path);
                    }
                });
            }
        } catch (cleanupError) {
            console.error('⚠️ File cleanup error:', cleanupError.message);
        }

        res.json({
            success: true,
            message: 'Excel file processed successfully',
            data: {
                totalRows: jsonData.length,
                processedLeads: processedLeads.length,
                duplicates: duplicates.length,
                errors: errors.length,
                excelFileName: excelFile.originalname,
                excelHeaders: Object.keys(jsonData[0]),
                details: {
                    leads: processedLeads.map(lead => ({
                        id: lead._id,
                        phone_number: lead.phone_number,
                        pan_number: lead.pan_number,
                        email: lead.email,
                        full_name: lead.full_name,
                        is_duplicate: lead.is_duplicate,
                        duplicate_reason: lead.duplicate_reason,
                        additional_fields: Object.keys(lead.additional_data || {})
                    })),
                    duplicateList: duplicates,
                    errorList: errors
                }
            }
        });

    } catch (error) {
        console.error('Excel upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing Excel file',
            error: error.message
        });
    }
});

// Function to extract ALL fields from Excel row dynamically
function extractAllFields(row, rowNumber) {
    const leadData = {
        uploaded_by: 'unknown',
        excel_file_name: 'unknown',
        excel_row_number: rowNumber,
        additional_data: {}
    };

    // Map common field names (case-insensitive)
    const fieldMappings = {
        'created_time': ['created_time', 'created time', 'date', 'created_date'],
        'ad_id': ['ad_id', 'ad id', 'adid', 'campaign_id'],
        'platform': ['platform', 'source', 'channel'],
        'what_is_your_monthly_salary': ['what_is_your_monthly_salary?', 'what_is_your_monthly_salary', 'salary', 'monthly_salary', 'income'],
        'phone_number': ['phone_number', 'phone number', 'phone', 'mobile', 'contact_number'],
        'pan_number': ['pan_number', 'pan number', 'pan_no', 'pan', 'pancard'],
        'email': ['email', 'email_id', 'email address'],
        'full_name': ['full_name', 'full name', 'name', 'customer_name'],
        'first_name': ['first_name', 'first name', 'fname'],
        'last_name': ['last_name', 'last name', 'lname'],
        'age': ['age', 'customer_age'],
        'gender': ['gender', 'sex'],
        'city': ['city', 'location', 'customer_city'],
        'state': ['state', 'customer_state'],
        'pincode': ['pincode', 'pin code', 'zipcode', 'postal_code'],
        'occupation': ['occupation', 'job', 'profession', 'work'],
        'company_name': ['company_name', 'company', 'employer'],
        'loan_amount': ['loan_amount', 'loan amount', 'amount_needed'],
        'loan_purpose': ['loan_purpose', 'loan purpose', 'purpose'],
        'existing_loans': ['existing_loans', 'existing loans', 'current_loans'],
        'credit_score': ['credit_score', 'credit score', 'cibil_score']
    };

    // Process each Excel column
    Object.keys(row).forEach(excelHeader => {
        const value = String(row[excelHeader] || '').trim();
        
        if (!value) return; // Skip empty values

        let fieldAssigned = false;

        // Try to map to known fields
        Object.keys(fieldMappings).forEach(modelField => {
            if (fieldMappings[modelField].some(alias => 
                alias.toLowerCase() === excelHeader.toLowerCase()
            )) {
                // Special processing for certain fields
                if (modelField === 'phone_number') {
                    leadData[modelField] = value.replace(/\D/g, ''); // Remove non-digits
                } else if (modelField === 'pan_number') {
                    leadData[modelField] = value.toUpperCase();
                } else {
                    leadData[modelField] = value;
                }
                fieldAssigned = true;
            }
        });

        // If not mapped to known field, store in additional_data
        if (!fieldAssigned) {
            leadData.additional_data[excelHeader] = value;
        }
    });

    return leadData;
}

// Function to check for duplicates
async function checkForDuplicates(leadData) {
    try {
        // Check by phone number
        const phoneDuplicate = await InstantFormLead.findOne({
            phone_number: leadData.phone_number
        });

        if (phoneDuplicate) {
            return {
                isDuplicate: true,
                reason: 'Phone number already exists',
                originalLeadId: phoneDuplicate._id
            };
        }

        // Check by PAN number (if provided)
        if (leadData.pan_number && leadData.pan_number.length > 0) {
            const panDuplicate = await InstantFormLead.findOne({
                pan_number: leadData.pan_number
            });

            if (panDuplicate) {
                return {
                    isDuplicate: true,
                    reason: 'PAN number already exists',
                    originalLeadId: panDuplicate._id
                };
            }
        }

        // Check by email (if provided)
        if (leadData.email && leadData.email.length > 0) {
            const emailDuplicate = await InstantFormLead.findOne({
                email: leadData.email
            });

            if (emailDuplicate) {
                return {
                    isDuplicate: true,
                    reason: 'Email already exists',
                    originalLeadId: emailDuplicate._id
                };
            }
        }

        return {
            isDuplicate: false,
            reason: null,
            originalLeadId: null
        };

    } catch (error) {
        console.error('Duplicate check error:', error);
        return {
            isDuplicate: false,
            reason: null,
            originalLeadId: null
        };
    }
}

// GET /api/instant-leads - Get all leads
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 100, is_duplicate, quality_lead } = req.query;
        
        let query = {};
        
        if (is_duplicate !== undefined) {
            query.is_duplicate = is_duplicate === 'true';
        }
        
        if (quality_lead !== undefined) {
            query.quality_lead = quality_lead === 'true';
        }

        const leads = await InstantFormLead.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await InstantFormLead.countDocuments(query);

        res.json({
            success: true,
            data: {
                leads,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching leads',
            error: error.message
        });
    }
});

// GET /api/instant-leads/duplicates - Get only duplicates
router.get('/duplicates', async (req, res) => {
    try {
        const duplicates = await InstantFormLead.find({ is_duplicate: true })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: {
                duplicates,
                count: duplicates.length
            }
        });

    } catch (error) {
        console.error('Get duplicates error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching duplicates',
            error: error.message
        });
    }
});

// GET /api/instant-leads/fields - Get all unique field names from Excel uploads
router.get('/fields', async (req, res) => {
    try {
        const sampleLead = await InstantFormLead.findOne({});
        
        if (!sampleLead) {
            return res.json({
                success: true,
                data: {
                    fields: [],
                    additionalFields: []
                }
            });
        }

        const standardFields = [
            'created_time', 'ad_id', 'platform', 'what_is_your_monthly_salary',
            'phone_number', 'pan_number', 'email', 'full_name', 'first_name',
            'last_name', 'age', 'gender', 'city', 'state', 'pincode',
            'occupation', 'company_name', 'loan_amount', 'loan_purpose',
            'existing_loans', 'credit_score'
        ];

        const additionalFields = Object.keys(sampleLead.additional_data || {});

        res.json({
            success: true,
            data: {
                standardFields,
                additionalFields,
                allFields: [...standardFields, ...additionalFields]
            }
        });

    } catch (error) {
        console.error('Get fields error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching field names',
            error: error.message
        });
    }
});

export default router;