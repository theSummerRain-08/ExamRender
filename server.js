const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URLSearchParams } = require("url");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PORT = Number(process.env.PORT || 3000);
const APP_ID = process.env.ZALO_APP_ID;
const APP_SECRET = process.env.ZALO_APP_SECRET;
const configuredBaseUrl = process.env.BASE_URL;
const isPlaceholderBaseUrl = configuredBaseUrl?.includes("ten-app-cua-ban.onrender.com");
const BASE_URL =
  configuredBaseUrl && !isPlaceholderBaseUrl
    ? configuredBaseUrl
    : process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${BASE_URL}/api/auth/zalo/callback`;

const sessions = new Map();

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function getSession(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies.sid;

  if (!sid || !sessions.has(sid)) {
    sid = randomToken();
    sessions.set(sid, {});
    res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/`);
  }

  return sessions.get(sid);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function exchangeCodeForToken(code, codeVerifier) {
  const response = await fetch("https://oauth.zaloapp.com/v4/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: APP_SECRET,
    },
    body: new URLSearchParams({
      app_id: APP_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.message || "Không đổi được Zalo access token");
  }

  return data;
}

async function fetchZaloProfile(accessToken) {
  const response = await fetch("https://graph.zalo.me/v2.0/me?fields=id,name,picture", {
    headers: {
      access_token: accessToken,
    },
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.message || "Không lấy được thông tin người dùng Zalo");
  }

  return {
    id: data.id,
    name: data.name || "Người dùng Zalo",
    picture: data.picture?.data?.url || data.picture || "",
  };
}

function serveStatic(req, res) {
  const requestedPath = new URL(req.url, BASE_URL).pathname;
  const fileName = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.resolve(__dirname, fileName);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    };

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE_URL);

    if (url.pathname === "/api/auth/zalo") {
      if (!APP_ID || !APP_SECRET) {
        sendJson(res, 500, { error: "Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trong biến môi trường" });
        return;
      }

      const session = getSession(req, res);
      const state = randomToken(24);
      const codeVerifier = randomToken(48);
      session.oauth = { state, codeVerifier };

      const params = new URLSearchParams({
        app_id: APP_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: sha256Base64Url(codeVerifier),
        state,
      });

      redirect(res, `https://oauth.zaloapp.com/v4/permission?${params.toString()}`);
      return;
    }

    if (url.pathname === "/api/auth/zalo/callback") {
      const session = getSession(req, res);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state || !session.oauth || session.oauth.state !== state) {
        redirect(res, "/login.html?error=zalo_state");
        return;
      }

      const token = await exchangeCodeForToken(code, session.oauth.codeVerifier);
      session.user = await fetchZaloProfile(token.access_token);
      delete session.oauth;

      redirect(res, "/index.html");
      return;
    }

    if (url.pathname === "/api/me") {
      const session = getSession(req, res);
      sendJson(res, session.user ? 200 : 401, session.user ? { user: session.user } : { error: "Unauthorized" });
      return;
    }

    if (url.pathname === "/api/logout") {
      const cookies = parseCookies(req);
      if (cookies.sid) {
        sessions.delete(cookies.sid);
      }

      res.writeHead(204, {
        "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
      res.end();
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Server đang chạy tại ${BASE_URL}`);
  console.log(`Zalo Redirect URI: ${REDIRECT_URI}`);
});
