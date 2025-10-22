# Database Configuration

This project uses **two database connections**:
1. **MongoDB** - Primary database using Mongoose ORM
2. **MySQL** - Read-only database connection for reporting/analytics

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory with the following variables:

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
MYSQL_DATABASE=your_database_name
```

**Note:** Replace `your_database_name` with your actual MySQL database name.

### 2. Database Connections

Both databases are initialized automatically when the server starts:

```javascript
// In index.js
await connectDB();      // MongoDB connection
await connectMySQL();   // MySQL connection
```

## Usage Examples

### MongoDB (Mongoose)

```javascript
import mongoose from "mongoose";

// Define a model
const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
});

const User = mongoose.model('User', UserSchema);

// CRUD operations
const user = await User.create({ name: "John", email: "john@example.com" });
const users = await User.find({ active: true });
await User.updateOne({ _id: userId }, { name: "Jane" });
await User.deleteOne({ _id: userId });
```

### MySQL (Read-only)

```javascript
import { executeQuery, getMySQLPool } from "./config/mysqlDb.js";

// Method 1: Using executeQuery helper
const users = await executeQuery(
    "SELECT * FROM users WHERE status = ?",
    ['active']
);

// Method 2: Using pool directly
const pool = getMySQLPool();
const [rows] = await pool.execute("SELECT * FROM orders");
```

## MySQL Connection Pool Settings

The MySQL connection uses a pool with the following configuration:

- **connectionLimit**: 10 connections
- **waitForConnections**: true
- **queueLimit**: 0 (unlimited)
- **enableKeepAlive**: true

## Important Notes

1. **MySQL Read-only User**: The MySQL connection uses a read-only user (`readonly`). This means:
   - Only SELECT queries are allowed
   - INSERT, UPDATE, DELETE operations will fail
   - This is by design for security and data integrity

2. **Connection Pooling**: MySQL uses connection pooling for better performance. Always release connections:
   ```javascript
   const connection = await pool.getConnection();
   try {
       // Your queries
   } finally {
       connection.release(); // Important!
   }
   ```

3. **Error Handling**: Both connections have built-in error handling and will exit the process if connection fails.

4. **Graceful Shutdown**: Both connections handle SIGINT signals for graceful shutdown.

## Functions Available

### MongoDB (`config/db.js`)
- `connectDB()` - Connects to MongoDB

### MySQL (`config/mysqlDb.js`)
- `connectMySQL()` - Creates and returns MySQL connection pool
- `getMySQLPool()` - Returns existing pool instance
- `executeQuery(query, params)` - Executes a query with parameters
- `closeMySQLConnection()` - Closes the connection pool

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running on your system
- Check the MONGODB_URI in .env file
- Verify network connectivity

### MySQL Connection Issues
- Ensure MySQL server is running
- Verify credentials (readonly/1234)
- Check if the database exists
- Ensure the readonly user has SELECT permissions:
  ```sql
  GRANT SELECT ON database_name.* TO 'readonly'@'localhost';
  FLUSH PRIVILEGES;
  ```

## Security Best Practices

1. Never commit `.env` file to version control
2. Use different credentials for development and production
3. Consider using connection encryption (SSL/TLS) in production
4. Regularly rotate database passwords
5. Monitor database access logs

