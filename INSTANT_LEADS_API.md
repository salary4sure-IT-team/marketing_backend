# Instant Form Leads API

## Overview
This API handles Excel file uploads for instant form leads from Meta (Facebook/Instagram) campaigns and automatically processes them to identify quality leads.

## MongoDB Schema: `InstantFormLead`

### Fields:
- **created_time**: String (format: "10/25/25")
- **ad_id**: String (e.g., "120231853365020170")
- **platform**: Enum ["fb", "ig", "etc"]
- **what_is_your_monthly_salary**: Enum with salary ranges:
  - "below 35K"
  - "₹35,000_to_₹50,000"
  - "₹50,000_to_₹70,000"
  - "₹70,000_to_₹1,00,000"
  - "above 1 Lakh"
- **phone_number**: String (10-15 digits, e.g., "919034955557")
- **quality_lead**: Boolean (auto-set based on salary > 35000 and MySQL match)
- **salary_numeric_value**: Number (for easy comparison)
- **uploaded_at**: Date (auto-generated)
- **uploaded_by**: String (marketing person name)
- **excel_file_name**: String (original file name)

## API Endpoints

### 1. Upload Excel File
**POST** `/api/instant-leads/upload`

**Headers:**
- `Content-Type: multipart/form-data`

**Body:**
- `excelFile`: Excel file (.xlsx)
- `uploadedBy`: String (optional, marketing person name)

**Required Excel Headers:**
- `created_time`
- `ad_id`
- `platform`
- `what_is_your_monthly_salary?`
- `phone_number`

**Response:**
```json
{
  "success": true,
  "message": "Excel file processed successfully",
  "data": {
    "totalRows": 100,
    "validLeads": 95,
    "errors": ["Row 5: Invalid platform 'twitter'"],
    "leads": [
      {
        "id": "507f1f77bcf86cd799439011",
        "phone_number": "919034955557",
        "salary": "₹35,000_to_₹50,000",
        "quality_lead": true,
        "created_time": "10/25/25"
      }
    ]
  }
}
```

### 2. Get All Leads
**GET** `/api/instant-leads`

**Query Parameters:**
- `page`: Number (default: 1)
- `limit`: Number (default: 100)
- `quality_lead`: Boolean (filter by quality lead status)
- `platform`: String (filter by platform: fb, ig, etc)
- `start_date`: String (filter by date range)
- `end_date`: String (filter by date range)

### 3. Get Statistics
**GET** `/api/instant-leads/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLeads": 1000,
    "qualityLeads": 250,
    "qualityLeadPercentage": "25.00",
    "platformStats": [
      {"_id": "fb", "count": 600},
      {"_id": "ig", "count": 350},
      {"_id": "etc", "count": 50}
    ],
    "salaryStats": [
      {"_id": "below 35K", "count": 200},
      {"_id": "₹35,000_to_₹50,000", "count": 300},
      {"_id": "₹50,000_to_₹70,000", "count": 250},
      {"_id": "₹70,000_to_₹1,00,000", "count": 150},
      {"_id": "above 1 Lakh", "count": 100}
    ]
  }
}
```

## Quality Lead Logic

A lead is automatically marked as `quality_lead: true` if:

1. **Salary > ₹35,000** (any range above "below 35K")
2. **Phone number exists in MySQL** `customer_profile` table
3. **Created date matches** between Excel and MySQL records

The system converts Excel date format ("10/25/25") to MySQL date format ("2025-10-25") for comparison.

## Sample Excel File

A sample Excel file `sample-instant-leads.xlsx` has been created with the correct format and sample data.

## Usage Example

```javascript
// Upload Excel file
const formData = new FormData();
formData.append('excelFile', fileInput.files[0]);
formData.append('uploadedBy', 'Marketing Team');

fetch('/api/instant-leads/upload', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Upload result:', data);
  console.log(`Processed ${data.data.validLeads} leads`);
  console.log(`Quality leads: ${data.data.leads.filter(l => l.quality_lead).length}`);
});
```

## Error Handling

The API validates:
- File format (Excel only)
- Required headers
- Data types and formats
- Duplicate phone numbers
- Phone number format (10-15 digits)
- Platform values (fb, ig, etc)
- Salary range values

All validation errors are returned in the response for easy debugging.
