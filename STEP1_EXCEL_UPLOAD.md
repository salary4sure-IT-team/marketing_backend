# Step 1: Excel Upload API for Instant Form Leads

## 🎯 **What This Does**
- Takes Excel file with instant form lead data
- Stores ALL rows in MongoDB `InstantFormLead` collection
- Detects duplicates by phone number and PAN number
- Marks duplicates with `is_duplicate: true`

## 📋 **Required Excel Headers**
- `created_time` (e.g., "10/25/25")
- `ad_id` (e.g., "120231853365020170")
- `platform` (e.g., "fb", "ig", "etc")
- `what_is_your_monthly_salary?` (salary ranges)
- `phone_number` (e.g., "919034955557")
- `pan_number` (e.g., "ABCDE1234F") - Optional

## 🔄 **Duplicate Detection Logic**
1. **Phone Number**: If same phone number exists → Duplicate
2. **PAN Number**: If same PAN number exists → Duplicate  
3. **Both**: If both phone and PAN match → Duplicate

## 📊 **API Endpoints**

### 1. Upload Excel File
**POST** `/api/instant-leads/upload`

**Body (multipart/form-data):**
- `excelFile`: Excel file (.xlsx)
- `uploadedBy`: String (optional)

**Response:**
```json
{
  "success": true,
  "message": "Excel file processed successfully",
  "data": {
    "totalRows": 100,
    "processedLeads": 95,
    "duplicates": 5,
    "errors": 0,
    "details": {
      "leads": [...],
      "duplicateList": [...],
      "errorList": [...]
    }
  }
}
```

### 2. Get All Leads
**GET** `/api/instant-leads`

**Query Parameters:**
- `page`: Number (default: 1)
- `limit`: Number (default: 100)
- `is_duplicate`: Boolean (filter duplicates)

### 3. Get Only Duplicates
**GET** `/api/instant-leads/duplicates`

## 🗄️ **MongoDB Schema**
```javascript
{
  created_time: String,
  ad_id: String,
  platform: String,
  what_is_your_monthly_salary: String,
  phone_number: String,
  pan_number: String,
  uploaded_at: Date,
  uploaded_by: String,
  excel_file_name: String,
  is_duplicate: Boolean,
  duplicate_reason: String,
  original_lead_id: ObjectId
}
```

## 🧪 **Testing**
1. **Create sample Excel**: `node create-sample-excel.js`
2. **Start server**: `npm start`
3. **Test API**: `node test-instant-leads-api.js`

## 📁 **Files Created**
- `models/InstantFormLead.js` - MongoDB schema
- `routes/instantLeadRoutes.js` - API routes
- `sample-instant-leads.xlsx` - Sample Excel file
- `test-instant-leads-api.js` - Test script

## ✅ **What's Working**
- ✅ Excel file upload and parsing
- ✅ Data validation and storage
- ✅ Duplicate detection by phone/PAN
- ✅ Error handling and reporting
- ✅ Pagination and filtering
- ✅ Sample data and testing

## 🚀 **Next Steps**
- Add quality lead matching with MySQL
- Add salary-based filtering
- Add statistics and analytics
- Add bulk operations
