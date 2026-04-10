import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "smud_auth";
const BASE = "/SMUD-contract-analyzer-v2";

function loginPage(error?: string) {
  const msg = error ? `<p style="color:#ef4444;margin-bottom:16px;font-size:14px">${error}</p>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — SMUD Contract Analyzer</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:12px;padding:40px;width:100%;max-width:380px;box-shadow:0 8px 30px rgba(0,0,0,.3)}
h1{font-size:18px;color:#1a2942;margin-bottom:4px}p.sub{font-size:13px;color:#94a3b8;margin-bottom:24px}
label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px}
input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:16px;outline:none}
input:focus{border-color:#3b82f6}button{width:100%;background:#1a2942;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#243652}</style></head>
<body><div class="card"><h1>SMUD Contract Analyzer</h1><p class="sub">Enter credentials to continue</p>${msg}
<form method="POST" action="${BASE}/login"><label>Username</label><input name="user" autocomplete="username" required autofocus>
<label>Password</label><input name="pass" type="password" autocomplete="current-password" required>
<button type="submit">Sign In</button></form></div></body></html>`;
}

export async function proxy(req: NextRequest) {
  const rawPath = new URL(req.url).pathname;

  if (rawPath.includes("/_next/") || rawPath === "/favicon.ico") {
    return NextResponse.next();
  }

  const expectedUser = process.env.SITE_USER;
  const expectedPass = process.env.SITE_PASSWORD;
  if (!expectedUser || !expectedPass) return NextResponse.next();

  const token = btoa(`${expectedUser}:${expectedPass}`);

  if (req.cookies.get(COOKIE_NAME)?.value === token) {
    return NextResponse.next();
  }

  if (req.method === "POST" && (rawPath === `${BASE}/login` || rawPath === BASE || rawPath === `${BASE}/`)) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const user = params.get("user") ?? "";
    const pass = params.get("pass") ?? "";

    if (user === expectedUser && pass === expectedPass) {
      const res = NextResponse.redirect(new URL(BASE, req.url), 303);
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    return new NextResponse(loginPage("Invalid username or password"), {
      status: 401,
      headers: { "Content-Type": "text/html" },
    });
  }

  return new NextResponse(loginPage(), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

