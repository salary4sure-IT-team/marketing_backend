import mongoose from 'mongoose';

const excelUploadHistorySchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    budget: {
        type: Number,
        required: true
    },
    uploadedBy: {
        type: String,
        default: 'unknown'
    },
    totalRows: {
        type: Number,
        default: 0
    },
    processedLeads: {
        type: Number,
        default: 0
    },
    duplicates: {
        type: Number,
        default: 0
    },
    errors: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
excelUploadHistorySchema.index({ uploadedAt: -1 });
excelUploadHistorySchema.index({ uploadedBy: 1 });

const ExcelUploadHistory = mongoose.model('ExcelUploadHistory', excelUploadHistorySchema);

export default ExcelUploadHistory;
