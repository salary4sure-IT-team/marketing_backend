import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema({
    // Customer information (from MySQL)
    customer_id: {
        type: Number,
        required: true,
        index: true
    },
    phone_number: {
        type: String,
        required: true,
        index: true
    },
    customer_name: {
        type: String,
        default: null
    },
    
    // Journey stage information
    journey_stage: {
        type: Number,
        index: true
    },
    journey_stage_name: {
        type: String,
        default: null
    },
    
    // Messaging metadata
    channel: {
        type: String,
        enum: ['sms', 'whatsapp', 'both'],
        default: 'sms',
        index: true
    },
    provider: {
        type: String,
        default: 'AiSensy',
        index: true
    },
    source: {
        type: String,
        default: 'bulk-sms-api'
    },
    userName: {
        type: String,
        default: 'SALARY4SURE'
    },
    
    // Message details
    campaign_name: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    template_params: {
        type: [String],
        default: []
    },
    
    // Batch tracking
    batch_id: {
        type: String,
        required: true,
        index: true
    },
    
    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed'],
        default: 'pending',
        index: true
    },
    
    // Provider request/response payloads
    request_payload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    response_payload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    message_id: {
        type: String,
        default: null
    },
    
    // Legacy AiSensy fields (optional)
    aisensy_response: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    aisensy_message_id: {
        type: String,
        default: null
    },
    
    // Error tracking
    error_message: String,
    error_code: String,
    
    // Timestamps
    created_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    sent_at: Date,
    failed_at: Date
}, {
    timestamps: true
});

// Indexes for performance
smsLogSchema.index({ status: 1, created_at: -1 });
smsLogSchema.index({ batch_id: 1, status: 1 });
smsLogSchema.index({ customer_id: 1, created_at: -1 });
smsLogSchema.index({ journey_stage: 1, status: 1 });
smsLogSchema.index({ provider: 1, channel: 1 });

const SmsLog = mongoose.model('SmsLog', smsLogSchema);

export default SmsLog;

