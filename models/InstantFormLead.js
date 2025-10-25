import mongoose from 'mongoose';

const instantFormLeadSchema = new mongoose.Schema({
    // Core Excel headers (required)
    created_time: {
        type: String,
        required: true
    },
    ad_id: {
        type: String,
        required: true
    },
    platform: {
        type: String,
        required: true
    },
    what_is_your_monthly_salary: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        required: true
    },
    
    // Common fields that might be in Excel
    pan_number: {
        type: String,
        default: null
    },
    email: {
        type: String,
        default: null
    },
    full_name: {
        type: String,
        default: null
    },
    first_name: {
        type: String,
        default: null
    },
    last_name: {
        type: String,
        default: null
    },
    age: {
        type: String,
        default: null
    },
    gender: {
        type: String,
        default: null
    },
    city: {
        type: String,
        default: null
    },
    state: {
        type: String,
        default: null
    },
    pincode: {
        type: String,
        default: null
    },
    occupation: {
        type: String,
        default: null
    },
    company_name: {
        type: String,
        default: null
    },
    loan_amount: {
        type: String,
        default: null
    },
    loan_purpose: {
        type: String,
        default: null
    },
    existing_loans: {
        type: String,
        default: null
    },
    credit_score: {
        type: String,
        default: null
    },
    
    // Dynamic fields - store any other Excel columns here
    additional_data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // System fields
    uploaded_at: {
        type: Date,
        default: Date.now
    },
    uploaded_by: {
        type: String,
        default: 'unknown'
    },
    excel_file_name: {
        type: String
    },
    excel_row_number: {
        type: Number,
        default: null
    },
    
    // Duplicate handling
    is_duplicate: {
        type: Boolean,
        default: false
    },
    duplicate_reason: {
        type: String,
        default: null
    },
    original_lead_id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    
    // Quality lead fields
    quality_lead: {
        type: Boolean,
        default: false
    },
    salary_numeric_value: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Pre-save middleware to set salary_numeric_value
instantFormLeadSchema.pre('save', function(next) {
    const salaryMapping = {
        'below 35K': 30000,
        '₹35,000_to_₹50,000': 42500,
        '₹50,000_to_₹70,000': 60000,
        '₹70,000_to_₹1,00,000': 85000,
        'above 1 Lakh': 120000
    };
    
    this.salary_numeric_value = salaryMapping[this.what_is_your_monthly_salary] || 0;
    next();
});

// Indexes for efficient queries
instantFormLeadSchema.index({ phone_number: 1 });
instantFormLeadSchema.index({ pan_number: 1 });
instantFormLeadSchema.index({ email: 1 });
instantFormLeadSchema.index({ phone_number: 1, pan_number: 1 });
instantFormLeadSchema.index({ quality_lead: 1 });
instantFormLeadSchema.index({ is_duplicate: 1 });
instantFormLeadSchema.index({ created_time: 1 });
instantFormLeadSchema.index({ ad_id: 1 });

const InstantFormLead = mongoose.model('InstantFormLead', instantFormLeadSchema);

export default InstantFormLead;