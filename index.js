import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors"; // Import cors
import connectDB from "./config/db.js";
import connectMySQL from "./config/mysqlDb.js";
import "dotenv/config.js";
import morgan from "morgan";
import { join } from "path";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger/swaggerConfig.js";
import exampleRoutes from "./routes/exampleRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import instantLeadRoutes from "./routes/instantLeadRoutes.js";

const PORT = process.env.PORT || 3000;

// Initialize both database connections
await connectDB(); // MongoDB connection
await connectMySQL(); // MySQL connection

const app = express();
app.set("trust proxy", true);

// Middleware
// CORS configuration
var corsOption = {
    origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://www.marketing.salary4sure.com",
        "https://marketing.salary4sure.com",
        "http://api2.salary4sure.com",
        "https://api2.salary4sure.com",
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
// CORS middleware with additional options
app.use(cors({
    ...corsOption,
    optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
    allowedHeaders: ['Content-Type', 'Authorization', 'Auth', 'Authtoken', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
}));
app.use(cookieParser()); //cookie parser middlerware
// app.use(
//     session({
//         secret: process.env.SESSION_KEY, // Replace with a secure, random string
//         resave: false, // Avoid resaving session variables if they haven't changed
//         saveUninitialized: false, // Don't save uninitialized sessions
//         cookie: {
//             httpOnly: true, // Helps prevent XSS attacks
//             secure: false, // Use HTTPS in production
//             maxAge: 5 * 60 * 1000, // 5 minute
//         },
//     })
// );
// JSON parsing middleware - conditional based on content type
app.use((req, res, next) => {
    const contentType = req.get('Content-Type');
    if (contentType && contentType.includes('multipart/form-data')) {
        // Skip JSON parsing for multipart requests
        return next();
    }
    // Apply JSON parsing for other requests
    express.json()(req, res, next);
});

app.use(express.urlencoded({ extended: true }));

// Logging middleware (optional)
app.use(morgan("dev")); // Log HTTP requests

// Serving static file..............
app.use(express.static(join(process.cwd(), "public")));
// Set the view engine to EJS
app.set("view engine", "ejs");

// Set the directory for EJS templates
app.set("views", join(process.cwd(), "views"));

// Swagger API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.get("/", (req, res) => {
    res.send("API is running.......");
});

// Example routes demonstrating database usage
app.use("/api/example", exampleRoutes);

// Customer routes for fetching customer data
app.use("/api/customers", customerRoutes);

// Report routes for fetching lead reports
app.use("/api/reports", reportRoutes);

// Instant form leads routes for Excel upload and processing
app.use("/api/instant-leads", instantLeadRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 */
app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Server is healthy",
        databases: {
            mongodb: "connected",
            mysql: "connected"
        },
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
    console.log(`📚 Swagger docs at http://localhost:${PORT}/api-docs`);
    console.log(`✅ MongoDB Connected`);
    console.log(`✅ MySQL Connected (Read-only)`);
});
