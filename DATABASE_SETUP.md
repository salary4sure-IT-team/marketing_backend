# Database Setup Guide

## Overview

This project now supports **dual database connections**:
- **MongoDB** - Primary database using Mongoose ORM
- **MySQL** - Read-only connection for reporting/analytics

## Quick Start

### 1. Create `.env` file

Copy `.env.example` to `.env` and update with your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual database credentials:

```env
# Server Configuration
PORT=3000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/marketing_db

# MySQL Configuration (Read-only user)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=readonly
MYSQL_PASSWORD=1234
MYSQL_DATABASE=your_actual_database_name  # <-- Update this!
```

### 2. Install Dependencies

The required packages have been installed:
- `mongoose` - MongoDB ORM (already installed)
- `mysql2` - MySQL client (newly installed)

### 3. Start the Server

```bash
npm run dev
```

You should see:
```
✅ MongoDB Connected: localhost
✅ MySQL Connected: localhost
Server is running on port: 3000
📚 Swagger docs at http://localhost:3000/api-docs
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and database connection status.

### Example Endpoints

#### MySQL Example
```
GET /api/example/mysql?table=users
```
Fetches data from MySQL database (read-only).

#### MongoDB Example
```
GET /api/example/mongodb
```
Lists all MongoDB collections.

#### Combined Example
```
GET /api/example/combined
```
Demonstrates fetching data from both databases.

## File Structure

```
marketing_backend/
├── config/
│   ├── db.js              # MongoDB connection
│   ├── mysqlDb.js         # MySQL connection pool
│   └── README.md          # Database configuration docs
├── middleware/
│   └── errorHandler.js    # Error handling middleware
├── routes/
│   └── exampleRoutes.js   # Example API routes
├── swagger/
│   └── swaggerConfig.js   # Swagger/OpenAPI configuration
├── utils/
│   └── dbExamples.js      # Database usage examples
├── .env.example           # Environment variables template
├── index.js               # Main application file
└── package.json
```

## Usage Examples

### Using MongoDB (Mongoose)

```javascript
import mongoose from "mongoose";

// Define a schema
const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Create
const user = await User.create({ 
    name: "John Doe", 
    email: "john@example.com" 
});

// Read
const users = await User.find({ active: true });

// Update
await User.updateOne({ _id: userId }, { name: "Jane Doe" });

// Delete
await User.deleteOne({ _id: userId });
```

### Using MySQL (Read-only)

```javascript
import { executeQuery, getMySQLPool } from "./config/mysqlDb.js";

// Method 1: Simple query with helper function
const users = await executeQuery(
    "SELECT * FROM users WHERE status = ? AND created_at > ?",
    ['active', '2024-01-01']
);

// Method 2: Using connection pool directly
const pool = getMySQLPool();
const [rows] = await pool.execute(
    "SELECT u.*, o.total FROM users u JOIN orders o ON u.id = o.user_id"
);

// Method 3: With connection management
const connection = await pool.getConnection();
try {
    const [rows] = await connection.execute("SELECT * FROM users");
    // Process rows
} finally {
    connection.release(); // Always release!
}
```

## MySQL Read-only User Setup

If you need to create the read-only MySQL user, run these SQL commands:

```sql
-- Create the user
CREATE USER 'readonly'@'localhost' IDENTIFIED BY '1234';

-- Grant SELECT permissions
GRANT SELECT ON your_database_name.* TO 'readonly'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;

-- Verify permissions
SHOW GRANTS FOR 'readonly'@'localhost';
```

## Important Notes

### Security
- ✅ MySQL user is read-only (SELECT only)
- ✅ Connection credentials in `.env` (not committed to git)
- ⚠️ Change default password in production
- ⚠️ Use SSL/TLS for database connections in production

### Performance
- MySQL uses connection pooling (10 connections max)
- MongoDB uses Mongoose with built-in connection pooling
- Always release MySQL connections back to the pool

### Error Handling
- Both connections handle errors and log them
- Application exits if database connection fails
- Graceful shutdown on SIGINT (Ctrl+C)

## Troubleshooting

### "MySQL pool is not initialized" Error
- Ensure `await connectMySQL()` is called before using the pool
- Check that it's called in `index.js` before starting the server

### "MongoDB connection failed" Error
- Verify MongoDB is running: `sudo systemctl status mongod`
- Check MONGODB_URI in `.env`
- Ensure network connectivity

### "Access denied for user 'readonly'" Error
- Verify MySQL credentials in `.env`
- Ensure the user exists and has SELECT permissions
- Check MySQL server is accessible

### Connection Timeout Errors
- Check firewall settings
- Verify database server is running
- Ensure correct host and port in `.env`

## Testing the Setup

### 1. Test MongoDB Connection
```bash
curl http://localhost:3000/api/example/mongodb
```

### 2. Test MySQL Connection
```bash
curl http://localhost:3000/api/example/mysql?table=users
```

### 3. Test Health Endpoint
```bash
curl http://localhost:3000/health
```

### 4. View API Documentation
Open browser: http://localhost:3000/api-docs

## Next Steps

1. ✅ Update `.env` with your actual database credentials
2. ✅ Test connections using the health endpoint
3. ✅ Create your own models and routes
4. ✅ Add proper error handling and validation
5. ✅ Implement authentication/authorization
6. ✅ Add logging for database operations
7. ✅ Set up database backups
8. ✅ Configure production environment

## Support

For more details, check:
- `config/README.md` - Database configuration details
- `utils/dbExamples.js` - More usage examples
- Swagger docs at `/api-docs` - API documentation

## Production Checklist

Before deploying to production:

- [ ] Change MySQL password from default '1234'
- [ ] Use environment-specific `.env` files
- [ ] Enable SSL/TLS for database connections
- [ ] Set up database monitoring
- [ ] Configure proper logging
- [ ] Set up automated backups
- [ ] Review and restrict database permissions
- [ ] Use connection encryption
- [ ] Set up health check monitoring
- [ ] Configure proper error alerting

