import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createSampleExcel = () => {
    const headers = [
        'created_time',
        'ad_id', 
        'platform',
        'what_is_your_monthly_salary?',
        'phone_number',
        'pan_number',
        'email',
        'full_name',
        'age',
        'gender',
        'city',
        'state',
        'pincode',
        'occupation',
        'company_name',
        'loan_amount',
        'loan_purpose',
        'existing_loans',
        'credit_score',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'device_type',
        'browser',
        'referrer_url'
    ];

    const data = [
        {
            created_time: '10/25/25',
            ad_id: '120231853365020170',
            platform: 'fb',
            'what_is_your_monthly_salary?': '₹35,000_to_₹50,000',
            phone_number: '919034955557',
            pan_number: 'ABCDE1234F',
            email: 'john.doe@email.com',
            full_name: 'John Doe',
            age: '28',
            gender: 'Male',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            occupation: 'Software Engineer',
            company_name: 'Tech Corp',
            loan_amount: '500000',
            loan_purpose: 'Home Purchase',
            existing_loans: 'No',
            credit_score: '750',
            utm_source: 'facebook',
            utm_medium: 'social',
            utm_campaign: 'home_loan_2024',
            device_type: 'mobile',
            browser: 'chrome',
            referrer_url: 'https://facebook.com'
        },
        {
            created_time: '10/25/25',
            ad_id: '120231853365020171',
            platform: 'ig',
            'what_is_your_monthly_salary?': 'below 35K',
            phone_number: '919034955558',
            pan_number: 'FGHIJ5678K',
            email: 'jane.smith@email.com',
            full_name: 'Jane Smith',
            age: '25',
            gender: 'Female',
            city: 'Delhi',
            state: 'Delhi',
            pincode: '110001',
            occupation: 'Marketing Executive',
            company_name: 'Marketing Solutions',
            loan_amount: '300000',
            loan_purpose: 'Personal',
            existing_loans: 'Yes',
            credit_score: '680',
            utm_source: 'instagram',
            utm_medium: 'social',
            utm_campaign: 'personal_loan_2024',
            device_type: 'mobile',
            browser: 'safari',
            referrer_url: 'https://instagram.com'
        },
        {
            created_time: '10/26/25',
            ad_id: '120231853365020172',
            platform: 'google',
            'what_is_your_monthly_salary?': '₹70,000_to_₹1,00,000',
            phone_number: '919034955559',
            pan_number: 'LMNOP9012Q',
            email: 'mike.wilson@email.com',
            full_name: 'Mike Wilson',
            age: '32',
            gender: 'Male',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
            occupation: 'Senior Manager',
            company_name: 'IT Solutions Ltd',
            loan_amount: '800000',
            loan_purpose: 'Business',
            existing_loans: 'No',
            credit_score: '780',
            utm_source: 'google',
            utm_medium: 'search',
            utm_campaign: 'business_loan_2024',
            device_type: 'desktop',
            browser: 'chrome',
            referrer_url: 'https://google.com'
        },
        {
            created_time: '10/26/25',
            ad_id: '120231853365020173',
            platform: 'fb',
            'what_is_your_monthly_salary?': '₹50,000_to_₹70,000',
            phone_number: '919034955560',
            pan_number: 'RSTUV3456W',
            email: 'sarah.johnson@email.com',
            full_name: 'Sarah Johnson',
            age: '29',
            gender: 'Female',
            city: 'Pune',
            state: 'Maharashtra',
            pincode: '411001',
            occupation: 'Accountant',
            company_name: 'Finance Corp',
            loan_amount: '400000',
            loan_purpose: 'Education',
            existing_loans: 'Yes',
            credit_score: '720',
            utm_source: 'facebook',
            utm_medium: 'social',
            utm_campaign: 'education_loan_2024',
            device_type: 'tablet',
            browser: 'firefox',
            referrer_url: 'https://facebook.com'
        },
        {
            created_time: '10/27/25',
            ad_id: '120231853365020174',
            platform: 'other',
            'what_is_your_monthly_salary?': 'above 1 Lakh',
            phone_number: '919034955561',
            pan_number: 'XYZAB7890C',
            email: 'david.brown@email.com',
            full_name: 'David Brown',
            age: '35',
            gender: 'Male',
            city: 'Chennai',
            state: 'Tamil Nadu',
            pincode: '600001',
            occupation: 'Director',
            company_name: 'Brown Enterprises',
            loan_amount: '1500000',
            loan_purpose: 'Investment',
            existing_loans: 'No',
            credit_score: '820',
            utm_source: 'direct',
            utm_medium: 'organic',
            utm_campaign: 'premium_loan_2024',
            device_type: 'desktop',
            browser: 'edge',
            referrer_url: 'https://salary4sure.com'
        }
    ];

    const worksheet = xlsx.utils.json_to_sheet(data, { header: headers });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Instant Leads');

    const filePath = path.join(__dirname, 'sample-instant-leads-comprehensive.xlsx');
    xlsx.writeFile(workbook, filePath);

    console.log(`✅ Comprehensive sample Excel file created: ${path.basename(filePath)}`);
    console.log('📋 Headers included:', headers);
    console.log('📊 Sample data rows:', data.length);
    console.log('\n📝 Instructions:');
    console.log('1. Upload this Excel file using POST /api/instant-leads/upload');
    console.log('2. Check for duplicates using GET /api/instant-leads/duplicates');
    console.log('3. View all leads using GET /api/instant-leads');
    console.log('4. Check available fields using GET /api/instant-leads/fields');
    console.log('\n🔍 This Excel includes ALL common fields that might be in real data!');
};

createSampleExcel();
