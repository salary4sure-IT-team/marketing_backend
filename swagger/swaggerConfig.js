import swaggerJsdoc from "swagger-jsdoc";

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Marketing Backend API",
            version: "1.0.0",
            description: "API documentation for Marketing Backend with MongoDB and MySQL connections",
            contact: {
                name: "API Support",
            },
        },
        servers: [
            {
                url: "http://localhost:3000",
                description: "Development server",
            },
            {
                url: "https://api.marketing.salary4sure.com",
                description: "Production server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
    },
    apis: ["./routes/*.js", "./index.js"], // Path to API routes
};

export const swaggerSpec = swaggerJsdoc(options);

