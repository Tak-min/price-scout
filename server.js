const http = require("http");
const fs = require("fs");
const path = require("path");
const geminiHandler = require("./api/gemini");

function serveStatic(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (error, data) => {
        if (error) {
            if (error.code === "ENOENT") {
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Not Found");
                return;
            }
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Internal Server Error");
            return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", contentType);
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/gemini")) {
        geminiHandler(req, res);
        return;
    }

    if (req.url === "/favicon.ico") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = new URL(req.url, "http://localhost");
    const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(__dirname, relativePath);
    serveStatic(filePath, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`PriceScout dev server running at http://localhost:${PORT}`);
});
