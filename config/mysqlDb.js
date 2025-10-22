import mysql from "mysql2/promise";

/**
 * MySQL Connection Pool (Read-only)
 */
let mysqlPool = null;

/**
 * Create and configure MySQL connection pool
 */
const connectMySQL = async () => {
    try {
        mysqlPool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            port: process.env.MYSQL_PORT || 3306,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
        });

        // Test the connection
        const connection = await mysqlPool.getConnection();
        console.log(`✅ MySQL Connected: ${process.env.MYSQL_HOST}`);
        connection.release();

        return mysqlPool;
    } catch (error) {
        console.error(`❌ Error connecting to MySQL: ${error.message}`);
        process.exit(1);
    }
};

/**
 * Get MySQL pool instance
 */
const getMySQLPool = () => {
    if (!mysqlPool) {
        throw new Error("MySQL pool is not initialized. Call connectMySQL() first.");
    }
    return mysqlPool;
};

/**
 * Execute a query on MySQL (Read-only operations)
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise} Query results
 */
const executeQuery = async (query, params = []) => {
    try {
        const pool = getMySQLPool();
        const [rows] = await pool.execute(query, params);
        return rows;
    } catch (error) {
        console.error("MySQL query error:", error);
        throw error;
    }
};

/**
 * Close MySQL connection pool
 */
const closeMySQLConnection = async () => {
    if (mysqlPool) {
        await mysqlPool.end();
        console.log("MySQL connection pool closed");
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    await closeMySQLConnection();
    process.exit(0);
});

export { connectMySQL, getMySQLPool, executeQuery, closeMySQLConnection };
export default connectMySQL;

