# Quick Start - Dual Database Configuration

## ✅ What Has Been Configured

Your project now supports **TWO database connections**:

1. **MongoDB** (Mongoose) - Primary database
2. **MySQL** (Read-only) - Username: `readonly`, Password: `1234`

## 🚀 Steps to Run

### 1. Create `.env` file

You need to manually create a `.env` file in the root directory with these variables:

```env
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/marketing_db

# MySQL (Read-only)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=readonly
MYSQL_PASSWORD=1234
MYSQL_DATABASE=your_database_name  # <-- CHANGE THIS!
```

**Important:** Replace `your_database_name` with your actual MySQL database name.

### 2. Start the Server

```bash
npm run dev
```

Expected output:
```
✅ MongoDB Connected: localhost
✅ MySQL Connected: localhost
Server is running on port: 3000
📚 Swagger docs at http://localhost:3000/api-docs
```

### 3. Test the Setup

Open these URLs in your browser or use curl:

- **Health Check:** http://localhost:3000/health
- **API Docs:** http://localhost:3000/api-docs
- **MongoDB Test:** http://localhost:3000/api/example/mongodb
- **MySQL Test:** http://localhost:3000/api/example/mysql?table=users

## 📁 New Files Created

```
marketing_backend/
├── config/
│   ├── db.js                  # MongoDB connection
│   ├── mysqlDb.js             # MySQL connection pool
│   └── README.md              # Database docs
├── middleware/
│   └── errorHandler.js        # Error handling
├── routes/
│   └── exampleRoutes.js       # Example API routes
├── swagger/
│   └── swaggerConfig.js       # Swagger setup
├── utils/
│   └── dbExamples.js          # Usage examples
├── .env.example               # Environment template
├── DATABASE_SETUP.md          # Complete setup guide
└── QUICK_START.md             # This file
```

## 💡 Usage Examples

### MongoDB (Mongoose)
```javascript
import mongoose from "mongoose";

const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: String
}));

const users = await User.find({});
```

### MySQL (Read-only)
```javascript
import { executeQuery } from "./config/mysqlDb.js";

const users = await executeQuery(
    "SELECT * FROM users WHERE status = ?", 
    ['active']
);
```

## 📦 New Package Installed

- **mysql2** - MySQL client for Node.js

## ⚠️ Important Notes

1. **Create `.env` file** - This is required and not auto-generated
2. **MySQL is READ-ONLY** - Only SELECT queries will work
3. **Update database name** - Change `your_database_name` in `.env`
4. Both connections initialize automatically when server starts

## 🔍 Need More Info?

- Full setup guide: `DATABASE_SETUP.md`
- Configuration details: `config/README.md`
- Code examples: `utils/dbExamples.js`
- API documentation: http://localhost:3000/api-docs (after starting server)

## 🐛 Troubleshooting

**"Cannot connect to MySQL"**
- Verify MySQL server is running
- Check credentials in `.env`
- Ensure readonly user has SELECT permissions

**"Cannot connect to MongoDB"**
- Verify MongoDB is running
- Check MONGODB_URI in `.env`

**"Module not found"**
- Run `npm install`

## ✨ You're All Set!

Just create the `.env` file and start the server!

