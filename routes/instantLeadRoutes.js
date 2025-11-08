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
        
        // Track duplicates within the same Excel file (PAN only)
        const seenPans = new Map(); // normalized PAN -> row number

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

                // Check for duplicates WITHIN the same Excel file using PAN only
                let isDuplicateInFile = false;
                let duplicateReason = '';
                let originalLeadId = null;

                if (leadData.pan_number && leadData.pan_number.trim()) {
                    const normalizedPan = leadData.pan_number.trim().toUpperCase();
                    if (seenPans.has(normalizedPan)) {
                        isDuplicateInFile = true;
                        duplicateReason = 'PAN number already exists in this file';
                        originalLeadId = seenPans.get(normalizedPan);
                    } else {
                        seenPans.set(normalizedPan, rowNumber);
                    }
                }

                // Mark as duplicate if found in file
                if (isDuplicateInFile) {
                    leadData.is_duplicate = true;
                    leadData.duplicate_reason = duplicateReason;
                    leadData._original_row_number = originalLeadId; // Store original row number temporarily
                    leadData.original_lead_id = null; // Will be updated after saving original lead
                    duplicates.push({
                        row: rowNumber,
                        phone: leadData.phone_number,
                        pan: leadData.pan_number,
                        reason: duplicateReason
                    });
                } else {
                    leadData.is_duplicate = false;
                    leadData.duplicate_reason = null;
                    leadData.original_lead_id = null;
                    leadData._original_row_number = null;
                }
                
                leadData.budget = budget ? Number(budget) : null;
                leadData.uploadHistoryId = uploadHistory._id; // Link to upload history
                leadData.excel_row_number = rowNumber; // Store row number for reference
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

        // Second pass: Save leads and handle matches
        let matchedCount = 0;
        
        // Track saved lead IDs by row number (for updating same-file duplicate references)
        const savedLeadIdsByRow = new Map();

        for (let i = 0; i < leadDataArray.length; i++) {
            const leadData = leadDataArray[i];
            
            try {
                // Normalize phone number and check if it matches customer_profile
                const normalizedPhone = normalizePhoneNumber(leadData.phone_number);
                const isMatched = normalizedPhone && matchedPhones.has(leadData.phone_number);
                
                if (isMatched) {
                    leadData.matched_in_customer_profile = true;
                    leadData.matched_at = new Date();
                    matchedCount++;
                    if (matchedCount <= 5) {
                        console.log(`✅ Match: ${leadData.phone_number} (normalized: ${normalizedPhone}) -> Matched in customer_profile`);
                    }
                } else {
                    leadData.matched_in_customer_profile = false;
                    leadData.matched_at = null;
                }

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

        console.log(`📊 Upload Summary: ${processedLeads.length} processed, ${matchedCount} matched, ${duplicates.length} duplicates (from file)`);

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

// Function to convert Excel date to JavaScript Date
function convertToDate(dateValue) {
    if (!dateValue) return null;
    
    // If already a Date object
    if (dateValue instanceof Date) {
        return dateValue;
    }
    
    // If it's a number (Excel serial date)
    if (typeof dateValue === 'number') {
        // Excel serial date: January 1, 1900 = 1
        // JavaScript Date: January 1, 1970 = 0
        // Difference: 25569 days (70 years * 365.25 days + leap years)
        // Standard formula: JS Date = (Excel serial - 25569) * 86400000
        const excelEpoch = 25569; // Days between Jan 1, 1900 and Jan 1, 1970
        const jsDate = new Date((dateValue - excelEpoch) * 86400000);
        return jsDate;
    }
    
    // If it's a string, try to parse it
    const strValue = String(dateValue).trim();
    
    // Try different date formats
    // Format: MM/DD/YY, DD/MM/YY, MM/DD/YYYY, or DD/MM/YYYY
    const dateMatch = strValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dateMatch) {
        const first = parseInt(dateMatch[1]);
        const second = parseInt(dateMatch[2]);
        let year = parseInt(dateMatch[3]);
        
        if (year < 100) {
            year += 2000; // Convert YY to YYYY (assuming 2000s)
        }
        
        // Auto-detect format: if first number > 12, it must be DD/MM/YY
        // Otherwise, assume MM/DD/YY (American format, matches user's '10/25/25' example)
        // if (first > 12) {
            // DD/MM/YY format
            const day = first;
            const month = second - 1; // JS months are 0-indexed
            return new Date(year, month, day);
        // } else {
        //     // MM/DD/YY format (default)
        //     const month = first - 1;
        //     const day = second;
        //     return new Date(year, month, day);
        // }
    }
    
    // Format 3: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = strValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1]);
        const month = parseInt(isoMatch[2]) - 1;
        const day = parseInt(isoMatch[3]);
        return new Date(year, month, day);
    }
    
    // Try JavaScript Date constructor as last resort
    const parsedDate = new Date(strValue);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
    }
    
    // If all parsing fails, return null
    return null;
}

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
                } else if (modelField === 'created_time') {
                    // Convert to Date object
                    leadData[modelField] = convertToDate(rawValue);
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
        if (leadData.pan_number && leadData.pan_number.length > 0) {
            const normalizedPan = leadData.pan_number.trim().toUpperCase();
            const panDuplicate = await InstantFormLead.findOne({ pan_number: normalizedPan });

            if (panDuplicate) {
                return {
                    isDuplicate: true,
                    reason: 'PAN number already exists',
                    originalLeadId: panDuplicate._id
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

// GET /api/instant-leads/recommended-loans - Get matched leads with recommended loan amounts
router.get('/recommended-loans', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required (format: YYYY-MM-DD)'
            });
        }

        // Parse dates
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999); // Set to end of day

        // Validate dates
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Get all InstantFormLead records matching criteria
        const leads = await InstantFormLead.find({
            created_time: {
                $gte: startDateObj,
                $lte: endDateObj
            },
            is_duplicate: false,
            matched_in_customer_profile: true
        }).select('phone_number full_name email pan_number created_time ad_id platform what_is_your_monthly_salary salary_numeric_value _id');

        if (leads.length === 0) {
            return res.json({
                success: true,
                total: 0,
                data: [],
                message: 'No matching leads found'
            });
        }

        // Normalize PAN numbers for MySQL query
        const normalizePan = (pan) => {
            if (!pan) return null;
            return String(pan).trim().toUpperCase().replace(/\s+/g, '');
        };

        // Get normalized PAN numbers from leads
        const panNumbers = leads
            .map(lead => normalizePan(lead.pan_number))
            .filter(pan => pan);

        if (panNumbers.length === 0) {
            return res.json({
                success: true,
                total: leads.length,
                data: leads.map(lead => ({
                    lead_id: lead._id,
                    phone_number: lead.phone_number,
                    full_name: lead.full_name,
                    email: lead.email,
                    pan_number: lead.pan_number,
                    created_time: lead.created_time,
                    ad_id: lead.ad_id,
                    platform: lead.platform,
                    salary_range: lead.what_is_your_monthly_salary,
                    salary_numeric_value: lead.salary_numeric_value,
                    customer_profile: null,
                    recommended_amount: null,
                    loan_id: null,
                    total_loans_found: 0,
                    matched_lead_ids: []
                })),
                message: 'No valid PAN numbers found'
            });
        }

        const uniquePanNumbers = [...new Set(panNumbers)];

        // Step 1: Find disbursed leads from leads table (by PAN)
        let disbursedLeads = [];
        try {
            const placeholders = uniquePanNumbers.map(() => '?').join(',');
            const leadsQuery = `
                SELECT lead_id, pancard
                FROM leads
                WHERE status = 'DISBURSED'
                  AND pancard IS NOT NULL
                  AND pancard != ''
                  AND UPPER(TRIM(CONVERT(pancard USING utf8mb4))) IN (${placeholders})
            `;
            disbursedLeads = await executeQuery(leadsQuery, uniquePanNumbers);
        } catch (error) {
            console.error('Error finding disbursed leads by PAN:', error.message);
            disbursedLeads = [];
        }

        // Map PAN -> array of disbursed lead records
        const panToLeadsMap = new Map();
        const disbursedLeadIds = new Set();
        disbursedLeads.forEach(leadRow => {
            const normalizedPan = normalizePan(leadRow.pancard);
            if (!normalizedPan) return;
            if (!panToLeadsMap.has(normalizedPan)) {
                panToLeadsMap.set(normalizedPan, []);
            }
            panToLeadsMap.get(normalizedPan).push({
                lead_id: leadRow.lead_id,
                pancard: leadRow.pancard
            });
            if (leadRow.lead_id) {
                disbursedLeadIds.add(leadRow.lead_id);
            }
        });

        // Step 2: Get loans from disbursed leads using lead_id
        let loanData = [];
        if (disbursedLeadIds.size > 0) {
            const leadIdList = Array.from(disbursedLeadIds);
            const leadPlaceholders = leadIdList.map(() => '?').join(',');
            try {
                const loanQuery = `
                    SELECT 
                        ln.loan_id,
                        ln.recommended_amount,
                        ln.lead_id
                    FROM loan ln
                    WHERE ln.lead_id IN (${leadPlaceholders})
                      AND ln.recommended_amount IS NOT NULL
                `;
                loanData = await executeQuery(loanQuery, leadIdList);
            } catch (error) {
                console.error('Error fetching loans:', error.message);
                loanData = [];
            }
        }

        // Create map: lead_id -> loans
        const loanMapByLeadId = new Map();
        loanData.forEach(loan => {
            const leadId = loan.lead_id;
            if (!leadId) return;
            if (!loanMapByLeadId.has(leadId)) {
                loanMapByLeadId.set(leadId, []);
            }
            loanMapByLeadId.get(leadId).push({
                recommended_amount: loan.recommended_amount || null,
                loan_id: loan.loan_id || null
            });
        });

        // Combine MongoDB leads with MySQL loan data
        const result = leads.map(lead => {
            const normalizedPan = normalizePan(lead.pan_number);
            const matchedLeads = normalizedPan ? (panToLeadsMap.get(normalizedPan) || []) : [];

            // Collect all loans linked to the matched leads
            const loansForPan = matchedLeads.reduce((acc, matchedLead) => {
                const loans = loanMapByLeadId.get(matchedLead.lead_id) || [];
                return acc.concat(loans.map(loan => ({ ...loan, lead_id: matchedLead.lead_id })));
            }, []);

            // Get the loan with highest recommended_amount if multiple exist
            const bestLoan = loansForPan.length > 0
                ? loansForPan.reduce((best, current) => {
                    const currentAmount = current.recommended_amount || 0;
                    const bestAmount = best.recommended_amount || 0;
                    return currentAmount > bestAmount ? current : best;
                })
                : null;

            return {
                lead_id: lead._id,
                phone_number: lead.phone_number,
                full_name: lead.full_name,
                email: lead.email,
                pan_number: lead.pan_number,
                created_time: lead.created_time,
                ad_id: lead.ad_id,
                platform: lead.platform,
                salary_range: lead.what_is_your_monthly_salary,
                salary_numeric_value: lead.salary_numeric_value,
                customer_profile: null,
                recommended_amount: bestLoan ? bestLoan.recommended_amount : null,
                loan_id: bestLoan ? bestLoan.loan_id : null,
                total_loans_found: loansForPan.length,
                matched_lead_ids: matchedLeads.map(match => match.lead_id)
            };
        });

        // Calculate totals
        const totalRecommendedAmount = result.reduce((sum, lead) => {
            return sum + (lead.recommended_amount || 0);
        }, 0);

        res.json({
            success: true,
            total: result.length,
            total_recommended_amount: totalRecommendedAmount,
            leads_with_loan: result.filter(l => l.recommended_amount !== null).length,
            leads_without_loan: result.filter(l => l.recommended_amount === null).length,
            data: result
        });

    } catch (error) {
        console.error('Error fetching recommended loans:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recommended loans',
            error: error.message
        });
    }
});

// GET /api/instant-leads/recommended-loans/total - Get total recommended loan amount only
router.get('/recommended-loans/total', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'startDate and endDate are required (format: YYYY-MM-DD)'
            });
        }

        // Parse dates
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);

        // Validate dates
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Count matching leads
        const totalLeads = await InstantFormLead.countDocuments({
            created_time: {
                $gte: startDateObj,
                $lte: endDateObj
            },
            is_duplicate: false,
            matched_in_customer_profile: true
        });

        if (totalLeads === 0) {
            return res.json({
                success: true,
                total_leads: 0,
                total_recommended_amount: 0,
                leads_with_loan: 0
            });
        }

        // Get phone numbers
        const leads = await InstantFormLead.find({
            created_time: {
                $gte: startDateObj,
                $lte: endDateObj
            },
            is_duplicate: false,
            matched_in_customer_profile: true
        }).select('phone_number');

        // Normalize phone numbers
        const normalizePhoneNumber = (phone) => {
            if (!phone) return null;
            let normalized = String(phone).replace(/\D/g, '');
            if (normalized.length === 12 && normalized.startsWith('91')) {
                normalized = normalized.substring(2);
            }
            normalized = normalized.replace(/^0+/, '');
            return normalized.length === 10 ? normalized : null;
        };

        const phoneNumbers = leads
            .map(lead => normalizePhoneNumber(lead.phone_number))
            .filter(phone => phone);

        if (phoneNumbers.length === 0) {
            return res.json({
                success: true,
                total_leads: totalLeads,
                total_recommended_amount: 0,
                leads_with_loan: 0
            });
        }

        // Get customer profiles first
        const placeholders = phoneNumbers.map(() => '?').join(',');
        const customerQuery = `
            SELECT cp_id
            FROM customer_profile
            WHERE cp_mobile IN (${placeholders})
        `;
        const customers = await executeQuery(customerQuery, phoneNumbers);
        const cpIds = customers.map(c => c.cp_id);

        if (cpIds.length === 0) {
            return res.json({
                success: true,
                total_leads: totalLeads,
                total_recommended_amount: 0,
                leads_with_loan: 0
            });
        }

        // Step 2: Find disbursed leads from leads table (by mobile phone)
        let disbursedLeadIds = [];
        
        try {
            // Find leads by matching mobile phone numbers, filter for DISBURSED status
            const leadsQuery = `
                SELECT lead_id
                FROM leads
                WHERE mobile IN (${placeholders})
                AND status = 'DISBURSED'
            `;
            const matchingLeads = await executeQuery(leadsQuery, phoneNumbers);
            disbursedLeadIds = matchingLeads.map(l => l.lead_id);
        } catch (error) {
            console.log('Error finding disbursed leads by mobile:', error.message);
            disbursedLeadIds = [];
        }

        // Step 3: Get sum of recommended amounts from loans of disbursed leads
        let result;
        if (disbursedLeadIds.length > 0) {
            const leadPlaceholders = disbursedLeadIds.map(() => '?').join(',');
            try {
                const query = `
                    SELECT 
                        SUM(ln.recommended_amount) as total_recommended_amount,
                        COUNT(DISTINCT ln.loan_id) as loans_count
                    FROM loan ln
                    WHERE ln.lead_id IN (${leadPlaceholders})
                    AND ln.recommended_amount IS NOT NULL
                `;
                [result] = await executeQuery(query, disbursedLeadIds);
            } catch (error) {
                console.error('Error fetching loan sum:', error.message);
                result = { total_recommended_amount: 0, loans_count: 0 };
            }
        } else {
            result = { total_recommended_amount: 0, loans_count: 0 };
        }

        res.json({
            success: true,
            total_leads: totalLeads,
            total_recommended_amount: result.total_recommended_amount || 0,
            leads_with_loan: result.loans_count || 0
        });

    } catch (error) {
        console.error('Error fetching total recommended loans:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching total recommended loans',
            error: error.message
        });
    }
});

// GET /api/instant-leads/recommended-loans/all - Get ALL matched leads (no date filter)
router.get('/recommended-loans/all', async (req, res) => {
    try {
        // Get all InstantFormLead records matching criteria (no date filter)
        const leads = await InstantFormLead.find({
            is_duplicate: false,
            matched_in_customer_profile: true
        }).select('phone_number full_name email pan_number created_time ad_id platform what_is_your_monthly_salary salary_numeric_value _id');

        if (leads.length === 0) {
            return res.json({
                success: true,
                total: 0,
                data: [],
                message: 'No matching leads found'
            });
        }

        // Normalize phone numbers for MySQL query
        const normalizePhoneNumber = (phone) => {
            if (!phone) return null;
            let normalized = String(phone).replace(/\D/g, '');
            if (normalized.length === 12 && normalized.startsWith('91')) {
                normalized = normalized.substring(2);
            }
            normalized = normalized.replace(/^0+/, '');
            return normalized.length === 10 ? normalized : null;
        };

        // Get normalized phone numbers from leads
        const phoneNumbers = leads
            .map(lead => normalizePhoneNumber(lead.phone_number))
            .filter(phone => phone);

        if (phoneNumbers.length === 0) {
            return res.json({
                success: true,
                total: 0,
                data: [],
                message: 'No valid phone numbers found'
            });
        }

        // Step 1: Get customer profiles by phone numbers
        const placeholders = phoneNumbers.map(() => '?').join(',');
        const customerQuery = `
            SELECT 
                cp.cp_id,
                cp.cp_mobile,
                cp.cp_first_name,
                cp.cp_sur_name
            FROM customer_profile cp
            WHERE cp.cp_mobile IN (${placeholders})
        `;

        const customers = await executeQuery(customerQuery, phoneNumbers);

        if (customers.length === 0) {
            return res.json({
                success: true,
                total: leads.length,
                data: leads.map(lead => ({
                    lead_id: lead._id,
                    phone_number: lead.phone_number,
                    full_name: lead.full_name,
                    email: lead.email,
                    pan_number: lead.pan_number,
                    created_time: lead.created_time,
                    ad_id: lead.ad_id,
                    platform: lead.platform,
                    salary_range: lead.what_is_your_monthly_salary,
                    salary_numeric_value: lead.salary_numeric_value,
                    customer_profile: null,
                    recommended_amount: null,
                    loan_id: null,
                    total_loans_found: 0
                })),
                message: 'No customer profiles found for these phone numbers'
            });
        }

        // Step 2: Find disbursed leads from leads table (by mobile phone)
        let disbursedLeadIds = [];
        
        try {
            // Find leads by matching mobile phone numbers, filter for DISBURSED status
            const leadsQuery = `
                SELECT lead_id, mobile
                FROM leads
                WHERE mobile IN (${placeholders})
                AND status = 'DISBURSED'
            `;
            const matchingLeads = await executeQuery(leadsQuery, phoneNumbers);
            disbursedLeadIds = matchingLeads.map(l => l.lead_id);
        } catch (error) {
            console.log('Error finding disbursed leads by mobile:', error.message);
            disbursedLeadIds = [];
        }

        // Step 3: Get loans from disbursed leads using lead_id
        let loanData = [];
        if (disbursedLeadIds.length > 0) {
            const leadPlaceholders = disbursedLeadIds.map(() => '?').join(',');
            try {
                const loanQuery = `
                    SELECT 
                        ln.loan_id,
                        ln.recommended_amount,
                        ln.lead_id
                    FROM loan ln
                    WHERE ln.lead_id IN (${leadPlaceholders})
                    AND ln.recommended_amount IS NOT NULL
                `;
                loanData = await executeQuery(loanQuery, disbursedLeadIds);
            } catch (error) {
                console.error('Error fetching loans:', error.message);
                loanData = [];
            }
        }

        // Create maps for quick lookup
        const customerMap = new Map();
        customers.forEach(customer => {
            const normalizedPhone = normalizePhoneNumber(customer.cp_mobile);
            if (normalizedPhone && !customerMap.has(normalizedPhone)) {
                customerMap.set(normalizedPhone, customer);
            }
        });

        // Create map: lead_id -> loans
        const leadLoanMap = new Map();
        loanData.forEach(loan => {
            const leadId = loan.lead_id;
            if (leadId) {
                if (!leadLoanMap.has(leadId)) {
                    leadLoanMap.set(leadId, []);
                }
                leadLoanMap.get(leadId).push({
                    recommended_amount: loan.recommended_amount || null,
                    loan_id: loan.loan_id || null
                });
            }
        });

        // Get disbursed leads with their phone numbers for matching
        let disbursedLeadsWithPhone = [];
        if (disbursedLeadIds.length > 0) {
            try {
                const leadPlaceholders = disbursedLeadIds.map(() => '?').join(',');
                const leadsWithPhoneQuery = `
                    SELECT lead_id, mobile
                    FROM leads
                    WHERE lead_id IN (${leadPlaceholders})
                `;
                disbursedLeadsWithPhone = await executeQuery(leadsWithPhoneQuery, disbursedLeadIds);
            } catch (error) {
                console.error('Error fetching leads with phone:', error.message);
            }
        }

        // Create map: phone -> lead_id for disbursed leads
        const phoneToLeadIdMap = new Map();
        disbursedLeadsWithPhone.forEach(lead => {
            if (lead.mobile) {
                const normalizedPhone = normalizePhoneNumber(lead.mobile);
                if (normalizedPhone) {
                    phoneToLeadIdMap.set(normalizedPhone, lead.lead_id);
                }
            }
        });

        // Create map: phone -> loans (via lead_id)
        const loanMapByPhone = new Map();
        phoneToLeadIdMap.forEach((leadId, phone) => {
            const loans = leadLoanMap.get(leadId) || [];
            if (loans.length > 0) {
                loanMapByPhone.set(phone, loans);
            }
        });

        // Combine MongoDB leads with MySQL loan data
        const result = leads.map(lead => {
            const normalizedPhone = normalizePhoneNumber(lead.phone_number);
            const customer = normalizedPhone ? customerMap.get(normalizedPhone) : null;
            const customerLoans = normalizedPhone ? (loanMapByPhone.get(normalizedPhone) || []) : [];

            // Get the loan with highest recommended_amount if multiple exist
            const bestLoan = customerLoans.length > 0
                ? customerLoans.reduce((best, current) => {
                    const currentAmount = current.recommended_amount || 0;
                    const bestAmount = best.recommended_amount || 0;
                    return currentAmount > bestAmount ? current : best;
                })
                : null;

            return {
                lead_id: lead._id,
                phone_number: lead.phone_number,
                full_name: lead.full_name,
                email: lead.email,
                pan_number: lead.pan_number,
                created_time: lead.created_time,
                ad_id: lead.ad_id,
                platform: lead.platform,
                salary_range: lead.what_is_your_monthly_salary,
                salary_numeric_value: lead.salary_numeric_value,
                customer_profile: customer ? {
                    cp_id: customer.cp_id,
                    cp_first_name: customer.cp_first_name,
                    cp_sur_name: customer.cp_sur_name
                } : null,
                recommended_amount: bestLoan ? bestLoan.recommended_amount : null,
                loan_id: bestLoan ? bestLoan.loan_id : null,
                total_loans_found: customerLoans.length
            };
        });

        // Calculate totals
        const totalRecommendedAmount = result.reduce((sum, lead) => {
            return sum + (lead.recommended_amount || 0);
        }, 0);

        res.json({
            success: true,
            total: result.length,
            total_recommended_amount: totalRecommendedAmount,
            leads_with_loan: result.filter(l => l.recommended_amount !== null).length,
            leads_without_loan: result.filter(l => l.recommended_amount === null).length,
            data: result
        });

    } catch (error) {
        console.error('Error fetching recommended loans:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recommended loans',
            error: error.message
        });
    }
});


// GET /api/instant-leads/recommended-loans/all 
router.get('/recommended-loans/all/live-leads', async (req, res) => {
    try {

        // Get all live instant form leads
        const liveLeads = await InstantFormLead.find({});

        // Get InstantFormLead records (matched, non-duplicate)
        const leads = await InstantFormLead.find({
            is_duplicate: false,
            matched_in_customer_profile: true,
            pan_number: { $exists: true, $ne: null, $ne: '' }
        }).select('phone_number full_name email pan_number created_time ad_id platform what_is_your_monthly_salary salary_numeric_value _id');

        const normalizePan = (pan) => {
            if (!pan) return null;
            return String(pan).trim().toUpperCase().replace(/\s+/g, '');
        };

        const uniquePanNumbers = [...new Set(liveLeads
            .map(lead => normalizePan(lead.pan_number))
            .filter(Boolean)
        )];

        if (uniquePanNumbers.length === 0) {
            const marketingLeadsQuery = `SELECT COUNT(*) AS total FROM leads WHERE utm_source = 'MARKETING'`;
            const [marketingLeadsRow] = await executeQuery(marketingLeadsQuery, []);
            const marketingLeadCount = marketingLeadsRow?.total || 0;

            const qualityLeadsQuery = `
                SELECT COUNT(*) AS total
                FROM leads
                WHERE utm_source = 'MARKETING'
                  AND monthly_salary_amount > ?
                  AND (status IS NULL OR status <> 'REJECTED')
            `;
            const [qualityLeadsRow] = await executeQuery(qualityLeadsQuery, [35000]);
            const qualityLeadCount = qualityLeadsRow?.total || 0;

            const convertedLeadsQuery = `
                SELECT COUNT(*) AS total
                FROM leads
                WHERE utm_source = 'MARKETING'
                  AND status = 'DISBURSED'
            `;
            const [convertedLeadsRow] = await executeQuery(convertedLeadsQuery, []);
            const convertedLeadCount = convertedLeadsRow?.total || 0;

            const marketingDisburseQuery = `
                SELECT SUM(ln.recommended_amount) AS total
                FROM leads le
                LEFT JOIN loan ln ON le.lead_id = ln.lead_id
                WHERE le.utm_source = 'MARKETING'
                  AND ln.recommended_amount IS NOT NULL
            `;
            const [marketingDisburseRow] = await executeQuery(marketingDisburseQuery, []);
            const marketingRecommendedAmount = Number(marketingDisburseRow?.total || 0);

            const budgetAgg = await ExcelUploadHistory.aggregate([
                { $group: { _id: null, total: { $sum: '$budget' } } }
            ]);
            const totalBudget = Number(budgetAgg?.[0]?.total || 0);

            return res.json({
                success: true,
                totals: {
                    totalLeads: liveLeads.length + marketingLeadCount,
                    instantFormLeads: leads.length,
                    marketingLeads: marketingLeadCount
                },
                qualityLeads: qualityLeadCount,
                convertedLeads: convertedLeadCount,
                amount_spend_on_marketing: totalBudget,
                disburseAmount: marketingRecommendedAmount,
                instantLeadRecommendedAmount: 0,
                marketingRecommendedAmount,
                data: []
            });
        }

        const placeholders = uniquePanNumbers.map(() => '?').join(',');
        const disbursedLeadsQuery = `
            SELECT 
                le.lead_id,
                le.pancard,
                le.status,
                le.utm_source,
                le.utm_campaign,
                le.monthly_salary_amount,
                ln.loan_id,
                ln.recommended_amount
            FROM leads le
            LEFT JOIN loan ln ON le.lead_id = ln.lead_id
            WHERE le.status = 'DISBURSED'
              AND le.pancard IS NOT NULL
              AND le.pancard != ''
              AND UPPER(TRIM(CONVERT(le.pancard USING utf8mb4))) IN (${placeholders})
        `;

        const disbursedLeads = await executeQuery(disbursedLeadsQuery, uniquePanNumbers);

        const loansByPan = new Map();
        disbursedLeads.forEach(row => {
            const normalizedPan = normalizePan(row.pancard);
            if (!normalizedPan) return;
            if (!loansByPan.has(normalizedPan)) {
                loansByPan.set(normalizedPan, []);
            }
            loansByPan.get(normalizedPan).push({
                lead_id: row.lead_id,
                loan_id: row.loan_id,
                recommended_amount: Number(row.recommended_amount || 0),
                utm_source: row.utm_source,
                utm_campaign: row.utm_campaign,
                monthly_salary_amount: row.monthly_salary_amount
            });
        });

        const result = leads.map(lead => {
            const normalizedPan = normalizePan(lead.pan_number);
            const matchedLoans = normalizedPan ? (loansByPan.get(normalizedPan) || []) : [];

            const bestLoan = matchedLoans.length > 0
                ? matchedLoans.reduce((best, current) => {
                    const currentAmount = current.recommended_amount || 0;
                    const bestAmount = best.recommended_amount || 0;
                    return currentAmount > bestAmount ? current : best;
                })
                : null;

            return {
                lead_id: lead._id,
                phone_number: lead.phone_number,
                full_name: lead.full_name,
                email: lead.email,
                pan_number: lead.pan_number,
                created_time: lead.created_time,
                ad_id: lead.ad_id,
                platform: lead.platform,
                salary_range: lead.what_is_your_monthly_salary,
                salary_numeric_value: lead.salary_numeric_value,
                loans: matchedLoans,
                recommended_amount: bestLoan ? bestLoan.recommended_amount : null,
                loan_id: bestLoan ? bestLoan.loan_id : null,
                total_loans_found: matchedLoans.length
            };
        });

        const instantRecommendedAmount = result.reduce((sum, lead) => {
            return sum + (lead.recommended_amount || 0);
        }, 0);

        const marketingLeadsQuery = `SELECT COUNT(*) AS total FROM leads WHERE utm_source = 'MARKETING'`;
        const [marketingLeadsRow] = await executeQuery(marketingLeadsQuery, []);
        const marketingLeadCount = marketingLeadsRow?.total || 0;

        const qualityLeadsQuery = `
            SELECT COUNT(*) AS total
            FROM leads
            WHERE utm_source = 'MARKETING'
              AND monthly_salary_amount > ?
              AND (status IS NULL OR status <> 'REJECTED')
        `;

        

        const [qualityLeadsRow] = await executeQuery(qualityLeadsQuery, [35000]);
        const qualityLeadCount = qualityLeadsRow?.total || 0;

        const convertedLeadsQuery = `
            SELECT COUNT(*) AS total
            FROM leads
            WHERE utm_source = 'MARKETING'
              AND status = 'DISBURSED'
        `;
        const [convertedLeadsRow] = await executeQuery(convertedLeadsQuery, []);
        const convertedLeadCount = convertedLeadsRow?.total || 0;

        const marketingDisburseQuery = `
            SELECT SUM(ln.recommended_amount) AS total
            FROM leads le
            LEFT JOIN loan ln ON le.lead_id = ln.lead_id
            WHERE le.utm_source = 'MARKETING'
              AND ln.recommended_amount IS NOT NULL
        `;
        const [marketingDisburseRow] = await executeQuery(marketingDisburseQuery, []);
        const marketingRecommendedAmount = Number(marketingDisburseRow?.total || 0);

        const budgetAgg = await ExcelUploadHistory.aggregate([
            { $group: { _id: null, total: { $sum: '$budget' } } }
        ]);
        const totalBudget = Number(budgetAgg?.[0]?.total || 0);

        const totalLeads = liveLeads.length + marketingLeadCount;
        const sanctionedAmount = instantRecommendedAmount + marketingRecommendedAmount;

        // Build the PAN list for matched instant-form leads only
const matchedPanNumbers = [
    ...new Set(
        leads
            .map(lead => normalizePan(lead.pan_number))
            .filter(Boolean)
    )
];

let nonRejectedInstantCount = 0;
if (matchedPanNumbers.length > 0) {
    const matchedPlaceholders = matchedPanNumbers.map(() => '?').join(',');
    const nonRejectedInstantQuery = `
        SELECT DISTINCT UPPER(TRIM(CONVERT(pancard USING utf8mb4))) AS pancard
        FROM leads
        WHERE (status IS NULL OR status <> 'SYSTEM-REJECT')
          AND pancard IS NOT NULL
          AND pancard != ''
          AND UPPER(TRIM(CONVERT(pancard USING utf8mb4))) IN (${matchedPlaceholders})
    `;
    const nonRejectedRows = await executeQuery(nonRejectedInstantQuery, matchedPanNumbers);
    nonRejectedInstantCount = nonRejectedRows.length;
}

        res.json({
            success: true,
            totals: {
                totalLeads,
                instantFormLeads: liveLeads.length,
                marketingLeads: marketingLeadCount
            },
            qualityLeads: qualityLeadCount + nonRejectedInstantCount,
            convertedLeads: convertedLeadCount +  loansByPan.size,
            amount_spend_on_marketing: totalBudget,
            sanctionedAmount,
            instantLeadRecommendedAmount: instantRecommendedAmount,
            marketingRecommendedAmount,
            // data: result
        });

    } catch (error) {
        console.error('Error fetching recommended loans:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recommended loans',
            error: error.message
        });
    }
});

export default router;
