import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import InstantFormLead from '../models/InstantFormLead.js';
import ExcelUploadHistory from '../models/ExcelUploadHistory.js';
import { executeQuery } from '../config/mysqlDb.js';

const router = express.Router();

// Middleware to completely bypass JSON parsing for upload route
router.use('/upload', (req, res, next) => {
    // Skip all body parsing middleware for this route
    req._skipBodyParsing = true;
    next();
});

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

// POST /api/instant-leads/upload - Raw route without JSON parsing
router.post('/upload', (req, res, next) => {
    // Create a new multer instance specifically for this route
    const uploadMiddleware = multer({ 
        storage: multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, 'uploads/');
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, 'instant-leads-' + uniqueSuffix + '.xlsx');
            }
        }),
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
        }
    });
    
    // Apply multer middleware
    uploadMiddleware.any()(req, res, (err) => {
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

        const { uploadedBy, budget } = req.body;
        console.log('💰 Budget received:', budget)
        
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
        
        // Debug: Check if PAN number header exists
        const headers = Object.keys(jsonData[0]);
        const panHeaders = headers.filter(h => 
            h.toLowerCase().includes('pan') || 
            h.toLowerCase().includes('pancard')
        );
        if (panHeaders.length > 0) {
            console.log('✅ PAN number headers found:', panHeaders);
        } else {
            console.log('⚠️ No PAN number headers found in Excel. Available headers:', headers);
        }

        // Create upload history record
        const uploadHistory = await ExcelUploadHistory.create({
            fileName: excelFile.originalname,
            uploadedAt: new Date(),
            budget: budget ? Number(budget) : 0,
            uploadedBy: uploadedBy || 'unknown',
            totalRows: jsonData.length,
            processedLeads: 0,
            duplicates: 0,
            errors: 0
        });

        // console.log('📝 Created upload history record:', uploadHistory._id);

        // Process each row
        const processedLeads = [];
        const duplicates = [];
        const errors = [];
        const leadDataArray = []; // Store all lead data first
        
        // Track duplicates within the same Excel file
        const seenPhones = new Map(); // normalized phone -> row number
        const seenPans = new Map(); // normalized PAN -> row number
        const seenEmails = new Map(); // normalized email -> row number

        // First pass: Extract and validate all leads
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            const rowNumber = i + 2; // Excel row number (accounting for header)

            try {
                // Extract ALL data from Excel row dynamically
                const leadData = extractAllFields(row, rowNumber);
                
                // If PAN number not found in main field, check additional_data
                if (!leadData.pan_number) {
                    // Check additional_data for PAN-related keys (including enter_your_pan_no.?)
                    const panKeys = Object.keys(leadData.additional_data || {}).filter(key => {
                        const lowerKey = key.toLowerCase();
                        return lowerKey.includes('pan') || 
                               lowerKey.includes('enter_your_pan') || 
                               lowerKey.includes('enter your pan') ||
                               lowerKey === 'enter_your_pan_no.?';
                    });
                    if (panKeys.length > 0) {
                        const panValue = leadData.additional_data[panKeys[0]];
                        if (panValue && String(panValue).trim()) {
                            leadData.pan_number = String(panValue).trim().toUpperCase().replace(/\s+/g, '');
                            delete leadData.additional_data[panKeys[0]]; // Remove from additional_data
                            console.log(`✅ Row ${rowNumber}: PAN found in additional_data under key "${panKeys[0]}" -> ${leadData.pan_number}`);
                        }
                    }
                }
                
                // Debug: Log PAN number extraction for first few rows
                if (i < 3) {
                    const rawPan = row['pan_number'] || row['pan number'] || row['pan_no'] || row['pan'] || row['pancard'] || row['enter_your_pan_no.?'] || row['enter_your_pan_no'] || 'NOT FOUND';
                    console.log(`🔍 Row ${rowNumber} - PAN extracted:`, leadData.pan_number, '| Raw PAN from Excel:', rawPan);
                    if (!leadData.pan_number && rawPan !== 'NOT FOUND') {
                        console.log(`⚠️ Row ${rowNumber}: PAN value exists in Excel (${rawPan}) but not extracted. Available headers:`, Object.keys(row));
                    }
                }

                // Basic validation for required fields
                if (!leadData.phone_number || leadData.phone_number.length < 10) {
                    errors.push(`Row ${rowNumber}: Invalid phone number`);
                    continue;
                }

                // Normalize phone number for comparison
                const normalizedPhone = normalizePhoneNumber(leadData.phone_number);
                
                // Check for duplicates WITHIN the same Excel file first
                let isDuplicateInFile = false;
                let duplicateReason = '';
                let originalLeadId = null;

                // Check by normalized phone number within file
                if (normalizedPhone && seenPhones.has(normalizedPhone)) {
                    isDuplicateInFile = true;
                    duplicateReason = 'Phone number already exists in this file';
                    originalLeadId = seenPhones.get(normalizedPhone);
                } else if (normalizedPhone) {
                    seenPhones.set(normalizedPhone, rowNumber); // Store row number for reference
                }

                // Check by PAN number within file
                if (!isDuplicateInFile && leadData.pan_number && leadData.pan_number.trim()) {
                    const normalizedPan = leadData.pan_number.trim().toUpperCase();
                    if (seenPans.has(normalizedPan)) {
                        isDuplicateInFile = true;
                        duplicateReason = 'PAN number already exists in this file';
                        originalLeadId = seenPans.get(normalizedPan);
                    } else {
                        seenPans.set(normalizedPan, rowNumber);
                    }
                }

                // Check by email within file
                if (!isDuplicateInFile && leadData.email && leadData.email.trim()) {
                    const normalizedEmail = leadData.email.trim().toLowerCase();
                    if (seenEmails.has(normalizedEmail)) {
                        isDuplicateInFile = true;
                        duplicateReason = 'Email already exists in this file';
                        originalLeadId = seenEmails.get(normalizedEmail);
                    } else {
                        seenEmails.set(normalizedEmail, rowNumber);
                    }
                }

                // Mark as duplicate if found in file
                if (isDuplicateInFile) {
                    leadData.is_duplicate = true;
                    leadData.duplicate_reason = duplicateReason;
                    // originalLeadId is row number for same-file duplicates, store separately
                    // Don't set original_lead_id yet (it needs to be ObjectId, not row number)
                    leadData._original_row_number = originalLeadId; // Store row number temporarily
                    leadData.original_lead_id = null; // Will be updated after saving original lead
                    duplicates.push({
                        row: rowNumber,
                        phone: leadData.phone_number,
                        pan: leadData.pan_number,
                        reason: duplicateReason
                    });
                } else {
                    // Initialize duplicate fields
                    leadData.is_duplicate = false;
                    leadData.duplicate_reason = null;
                    leadData.original_lead_id = null;
                    leadData._original_row_number = null;
                }
                
                leadData.budget = budget ? Number(budget) : null;
                leadData.uploadHistoryId = uploadHistory._id; // Link to upload history
                leadData.excel_row_number = rowNumber; // Store row number for reference
                leadData.normalized_phone = normalizedPhone; // Store normalized for MongoDB comparison
                leadDataArray.push(leadData);

            } catch (error) {
                errors.push(`Row ${rowNumber}: ${error.message}`);
                console.error(`❌ Row ${rowNumber} error:`, error.message);
            }
        }

        // Batch check phone numbers against customer_profile
        const phoneNumbers = leadDataArray.map(lead => lead.phone_number).filter(phone => phone);
        const matchedPhones = await checkPhoneNumbersInCustomerProfile(phoneNumbers);
        console.log(`✅ Found ${matchedPhones.size} matching phone numbers in customer_profile`);

        // Batch fetch existing leads from MongoDB to check for duplicates
        // Get all normalized phone numbers, PANs, and emails from current batch
        const normalizedPhonesToCheck = leadDataArray
            .map(lead => lead.normalized_phone)
            .filter(phone => phone);

        const pansToCheck = leadDataArray
            .map(lead => lead.pan_number)
            .filter(pan => pan && pan.trim())
            .map(pan => pan.trim().toUpperCase());

        const emailsToCheck = leadDataArray
            .map(lead => lead.email)
            .filter(email => email && email.trim())
            .map(email => email.trim().toLowerCase());

        // Fetch existing leads from MongoDB
        const existingLeads = await InstantFormLead.find({
            $or: [
                // We'll check phone numbers in memory after normalizing
                ...(pansToCheck.length > 0 ? [{ pan_number: { $in: pansToCheck } }] : []),
                ...(emailsToCheck.length > 0 ? [{ email: { $in: emailsToCheck } }] : [])
            ]
        }).select('phone_number pan_number email _id');

        // Fetch leads that might match phone numbers (optimize by checking last 6 months or limit)
        // Since we need to normalize, we'll fetch recent leads and normalize in memory
        // For better performance, you could add an index on phone_number and query more specifically
        const allLeadsWithPhones = await InstantFormLead.find({
            phone_number: { $exists: true, $ne: null, $ne: '' }
        })
        .select('phone_number _id')
        .limit(100000); // Limit to prevent memory issues with very large databases

        // Create maps for quick lookup (normalized values)
        const existingPhonesMap = new Map(); // normalized phone -> _id
        const existingPansMap = new Map(); // normalized PAN -> _id
        const existingEmailsMap = new Map(); // normalized email -> _id

        // Normalize all existing phone numbers and add to map
        allLeadsWithPhones.forEach(lead => {
            if (lead.phone_number) {
                const normalized = normalizePhoneNumber(lead.phone_number);
                if (normalized && !existingPhonesMap.has(normalized)) {
                    existingPhonesMap.set(normalized, lead._id);
                }
            }
        });

        // Add PANs and emails to maps
        existingLeads.forEach(lead => {
            if (lead.pan_number) {
                const normalizedPan = lead.pan_number.trim().toUpperCase();
                if (!existingPansMap.has(normalizedPan)) {
                    existingPansMap.set(normalizedPan, lead._id);
                }
            }
            if (lead.email) {
                const normalizedEmail = lead.email.trim().toLowerCase();
                if (!existingEmailsMap.has(normalizedEmail)) {
                    existingEmailsMap.set(normalizedEmail, lead._id);
                }
            }
        });

        console.log(`🔍 Checking duplicates against MongoDB: ${existingPhonesMap.size} phones, ${existingPansMap.size} PANs, ${existingEmailsMap.size} emails`);

        // Second pass: Check against MongoDB and save leads
        let matchedCount = 0;
        let duplicateCountFromDb = 0;
        
        // Track saved lead IDs by row number (for updating same-file duplicate references)
        const savedLeadIdsByRow = new Map();

        for (let i = 0; i < leadDataArray.length; i++) {
            const leadData = leadDataArray[i];
            
            try {
                // Check for duplicates in MongoDB (if not already marked as duplicate in file)
                if (!leadData.is_duplicate) {
                    const normalizedPhone = leadData.normalized_phone;
                    
                    // Check by normalized phone number
                    if (normalizedPhone && existingPhonesMap.has(normalizedPhone)) {
                        leadData.is_duplicate = true;
                        leadData.duplicate_reason = 'Phone number already exists in database';
                        leadData.original_lead_id = existingPhonesMap.get(normalizedPhone);
                        duplicateCountFromDb++;
                        duplicates.push({
                            row: leadData.excel_row_number,
                            phone: leadData.phone_number,
                            pan: leadData.pan_number,
                            reason: leadData.duplicate_reason
                        });
                    }
                    // Check by PAN number
                    else if (leadData.pan_number && leadData.pan_number.trim()) {
                        const normalizedPan = leadData.pan_number.trim().toUpperCase();
                        if (existingPansMap.has(normalizedPan)) {
                            leadData.is_duplicate = true;
                            leadData.duplicate_reason = 'PAN number already exists in database';
                            leadData.original_lead_id = existingPansMap.get(normalizedPan);
                            duplicateCountFromDb++;
                            duplicates.push({
                                row: leadData.excel_row_number,
                                phone: leadData.phone_number,
                                pan: leadData.pan_number,
                                reason: leadData.duplicate_reason
                            });
                        }
                    }
                    // Check by email
                    else if (leadData.email && leadData.email.trim()) {
                        const normalizedEmail = leadData.email.trim().toLowerCase();
                        if (existingEmailsMap.has(normalizedEmail)) {
                            leadData.is_duplicate = true;
                            leadData.duplicate_reason = 'Email already exists in database';
                            leadData.original_lead_id = existingEmailsMap.get(normalizedEmail);
                            duplicateCountFromDb++;
                            duplicates.push({
                                row: leadData.excel_row_number,
                                phone: leadData.phone_number,
                                pan: leadData.pan_number,
                                reason: leadData.duplicate_reason
                            });
                        }
                    }
                }

                // Normalize phone number and check if it matches customer_profile
                const normalizedPhone = normalizePhoneNumber(leadData.phone_number);
                const isMatched = normalizedPhone && matchedPhones.has(leadData.phone_number);
                
                if (isMatched) {
                    leadData.matched_in_customer_profile = true;
                    leadData.matched_at = new Date();
                    matchedCount++;
                    // Only log first 5 matches per upload to avoid console spam
                    if (matchedCount <= 5) {
                        console.log(`✅ Match: ${leadData.phone_number} (normalized: ${normalizedPhone}) -> Matched in customer_profile`);
                    }
                } else {
                    leadData.matched_in_customer_profile = false;
                    leadData.matched_at = null;
                }

                // Remove normalized_phone from leadData before saving (it's just for comparison)
                delete leadData.normalized_phone;

                // Remove temporary _original_row_number before saving (it's not part of schema)
                const originalRowNumber = leadData._original_row_number;
                delete leadData._original_row_number;
                
                // Store in MongoDB (save even if duplicate, so you can track them)
                const savedLead = await InstantFormLead.create(leadData);
                processedLeads.push(savedLead);
                
                // Track saved lead ID by row number
                savedLeadIdsByRow.set(leadData.excel_row_number, savedLead._id);
                
                // If this was marked as duplicate from same file, update original_lead_id with actual MongoDB _id
                if (leadData.is_duplicate && leadData.duplicate_reason && leadData.duplicate_reason.includes('in this file')) {
                    // The originalRowNumber was stored in _original_row_number, find the actual MongoDB _id
                    if (originalRowNumber && savedLeadIdsByRow.has(originalRowNumber)) {
                        const originalLeadMongoId = savedLeadIdsByRow.get(originalRowNumber);
                        await InstantFormLead.updateOne(
                            { _id: savedLead._id },
                            { original_lead_id: originalLeadMongoId }
                        );
                        savedLead.original_lead_id = originalLeadMongoId;
                    }
                }

                console.log(`✅ Row ${leadData.excel_row_number}: Processed - Phone: ${leadData.phone_number}, Duplicate: ${leadData.is_duplicate}, Matched: ${leadData.matched_in_customer_profile}`);

            } catch (error) {
                errors.push(`Row ${leadData.excel_row_number}: ${error.message}`);
                console.error(`❌ Row ${leadData.excel_row_number} error:`, error.message);
            }
        }

        console.log(`📊 Upload Summary: ${processedLeads.length} processed, ${matchedCount} matched, ${duplicates.length} duplicates (${duplicateCountFromDb} from DB, ${duplicates.length - duplicateCountFromDb} from file)`);

        // Update upload history with final counts
        await ExcelUploadHistory.findByIdAndUpdate(uploadHistory._id, {
            processedLeads: processedLeads.length,
            duplicates: duplicates.length,
            errors: errors.length,
            matchedInCustomerProfile: matchedCount
        });

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

    const updatedUploadHistory = await ExcelUploadHistory.findByIdAndUpdate(uploadHistory._id, {
            matchedInCustomerProfile: matchedCount,
            unmatchedInCustomerProfile: processedLeads.length - matchedCount
        });
        console.log(updatedUploadHistory);

        res.json({
            success: true,
            message: 'Excel file processed successfully',
            data: {
                uploadHistoryId: uploadHistory._id,
                totalRows: jsonData.length,
                processedLeads: processedLeads.length,
                duplicates: duplicates.length,
                errors: errors.length,
                matchedInCustomerProfile: matchedCount,
                unmatchedInCustomerProfile: processedLeads.length - matchedCount,
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
                        matched_in_customer_profile: lead.matched_in_customer_profile,
                        matched_at: lead.matched_at,
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
        'pan_number': ['pan_number', 'pan number', 'pan_no', 'pan', 'pancard', 'pan card', 'pan_card', 'pancard number', 'pancard_no', 'pancard_number', 'pan_no.', 'pan number.', 'pan_no_', 'enter_your_pan_no.?', 'enter_your_pan_no', 'enter your pan no', 'enter your pan number', 'enter_pan_no', 'enter pan no'],
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
        const rawValue = row[excelHeader];
        const value = rawValue !== null && rawValue !== undefined ? String(rawValue).trim() : '';
        
        // Allow empty strings for optional fields, but skip completely null/undefined
        if (rawValue === null || rawValue === undefined) {
            return; // Skip null/undefined values
        }

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
                    // For PAN, allow empty string but convert to null if empty
                    leadData[modelField] = value ? value.toUpperCase().replace(/\s+/g, '') : null;
                } else {
                    leadData[modelField] = value || null;
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

// Function to normalize phone number (remove country code, leading zeros, spaces, etc.)
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    // Convert to string and remove all non-digits
    let normalized = String(phone).replace(/\D/g, '');
    
    // Remove country code (91) if present and number is 12 digits
    if (normalized.length === 12 && normalized.startsWith('91')) {
        normalized = normalized.substring(2);
    }
    
    // Remove leading zeros
    normalized = normalized.replace(/^0+/, '');
    
    // Must be 10 digits for valid Indian mobile number
    if (normalized.length !== 10) {
        return null;
    }
    
    return normalized;
}

// Function to check if phone numbers exist in MySQL customer_profile
async function checkPhoneNumbersInCustomerProfile(phoneNumbers) {
    try {
        if (!phoneNumbers || phoneNumbers.length === 0) {
            return new Set();
        }

        // Normalize and filter valid phone numbers
        const normalizedPhonesMap = new Map(); // Map normalized -> original for lookup
        const normalizedPhones = [];
        
        phoneNumbers.forEach(phone => {
            if (!phone) return;
            const normalized = normalizePhoneNumber(phone);
            if (normalized && !normalizedPhonesMap.has(normalized)) {
                normalizedPhones.push(normalized);
                normalizedPhonesMap.set(normalized, phone);
            }
        });
        
        if (normalizedPhones.length === 0) {
            console.log('⚠️ No valid normalized phone numbers to check');
            return new Set();
        }

        console.log(`🔍 Checking ${normalizedPhones.length} unique phone numbers against customer_profile...`);
        console.log(`📱 Sample phones to check: ${normalizedPhones.slice(0, 5).join(', ')}`);

        // Query MySQL customer_profile for matching phone numbers
        // Create a set of normalized phone numbers we're looking for
        const normalizedPhonesSet = new Set(normalizedPhones);
        
        // Query to get customer phones and normalize them in memory
        // For better performance with large databases, we could use a WHERE IN clause,
        // but for accuracy, we'll normalize all and compare
        const query = `
            SELECT DISTINCT cp_mobile
            FROM customer_profile
            WHERE cp_mobile IS NOT NULL 
              AND cp_mobile != ''
              AND LENGTH(cp_mobile) >= 10
        `;

        const allCustomerPhones = await executeQuery(query, []);
        console.log(`📊 Total customer profiles in database: ${allCustomerPhones.length}`);
        
        // Normalize all database phone numbers and create a set
        const normalizedDbPhones = new Set();
        let normalizedCount = 0;
        allCustomerPhones.forEach(row => {
            const normalized = normalizePhoneNumber(row.cp_mobile);
            if (normalized) {
                normalizedDbPhones.add(normalized);
                normalizedCount++;
            }
        });
        
        console.log(`📱 Valid normalized customer phones: ${normalizedDbPhones.size}`);
        
        // Match normalized input phones with normalized database phones
        const matchedPhones = new Set();
        let matchCount = 0;
        normalizedPhonesMap.forEach((originalPhone, normalizedPhone) => {
            if (normalizedDbPhones.has(normalizedPhone)) {
                matchedPhones.add(originalPhone);
                matchCount++;
                // Only log first 10 matches to avoid console spam
                if (matchCount <= 10) {
                    console.log(`✅ Match found: ${originalPhone} -> ${normalizedPhone}`);
                }
            }
        });
        
        if (matchCount > 10) {
            console.log(`✅ ... and ${matchCount - 10} more matches`);
        }
        
        console.log(`✅ Total matches: ${matchedPhones.size} out of ${normalizedPhones.length} phone numbers checked`);
        
        return matchedPhones;
    } catch (error) {
        console.error('❌ Error checking phone numbers in customer_profile:', error);
        console.error('Error details:', error.message);
        return new Set(); // Return empty set on error
    }
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

            console.log(leads);

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

// GET /api/instant-leads/test-match/:phone - Test phone number matching
router.get('/test-match/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        const normalized = normalizePhoneNumber(phone);
        
        // Get all customer phones and check
        const query = `
            SELECT DISTINCT cp_mobile
            FROM customer_profile
            WHERE cp_mobile IS NOT NULL 
              AND cp_mobile != ''
              AND LENGTH(cp_mobile) >= 10
            LIMIT 1000
        `;
        
        const customerPhones = await executeQuery(query, []);
        const normalizedDbPhones = new Set();
        
        customerPhones.forEach(row => {
            const normalizedDb = normalizePhoneNumber(row.cp_mobile);
            if (normalizedDb) {
                normalizedDbPhones.add(normalizedDb);
            }
        });
        
        const isMatched = normalized && normalizedDbPhones.has(normalized);
        
        res.json({
            success: true,
            data: {
                inputPhone: phone,
                normalizedPhone: normalized,
                isMatched: isMatched,
                totalCustomerPhonesChecked: customerPhones.length,
                normalizedCustomerPhones: normalizedDbPhones.size,
                sampleCustomerPhones: Array.from(customerPhones.slice(0, 10).map(r => ({
                    original: r.cp_mobile,
                    normalized: normalizePhoneNumber(r.cp_mobile)
                })))
            }
        });
    } catch (error) {
        console.error('Test match error:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing phone match',
            error: error.message
        });
    }
});

// GET /api/instant-leads/history - Get upload history for frontend display
router.get('/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await ExcelUploadHistory.countDocuments();
        const history = await ExcelUploadHistory.find({})
            .sort({ uploadedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            data: {
                history,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalRecords: total,
                    hasNext: page * limit < total,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching upload history',
            error: error.message
        });
    }
});

// PUT /api/instant-leads/history/:id - Update budget amount
router.put('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { budget } = req.body;

        if (budget === undefined || budget === null) {
            return res.status(400).json({
                success: false,
                message: 'Budget is required'
            });
        }

        const updatedHistory = await ExcelUploadHistory.findByIdAndUpdate(
            id,
            { budget: Number(budget) },
            { new: true, runValidators: true }
        );

        if (!updatedHistory) {
            return res.status(404).json({
                success: false,
                message: 'Upload history not found'
            });
        }

        res.json({
            success: true,
            message: 'Budget updated successfully',
            data: updatedHistory
        });

    } catch (error) {
        console.error('Update budget error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating budget',
            error: error.message
        });
    }
});



// DELETE /api/instant-leads/history/:id - Delete history and associated leads
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if history exists
        const history = await ExcelUploadHistory.findById(id);
        if (!history) {
            return res.status(404).json({
                success: false,
                message: 'Upload history not found'
            });
        }

        // Delete associated leads first
        const deletedLeads = await InstantFormLead.deleteMany({ uploadHistoryId: id });
        console.log(`🗑️ Deleted ${deletedLeads.deletedCount} leads for history ${id}`);

        // Delete history record
        await ExcelUploadHistory.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Upload history and associated leads deleted successfully',
            data: {
                deletedHistoryId: id,
                deletedLeadsCount: deletedLeads.deletedCount
            }
        });

    } catch (error) {
        console.error('Delete history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting upload history',
            error: error.message
        });
    }
});

export default router;
