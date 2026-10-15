// Mission Parivartan — Sam English Tutor — LOGIN (Phase 2)
// Checks mobile number + password against the Supabase students table.
//
// SECURITY MODEL (server-side gate, see requirements doc):
//   The browser NEVER talks to Supabase. This file runs on Vercel's server,
//   holds the secret key, and is the only thing that touches the database.
//   The password is compared here and never leaves the server.
//
// NEEDS THREE VERCEL ENVIRONMENT VARIABLES:
//   SUPABASE_URL          — Supabase → Settings → API → Project URL
//   SUPABASE_URL is the short form, e.g. https://xxxx.supabase.co (no /rest/v1/).
//   SUPABASE_SERVICE_KEY  — Supabase → Settings → API Keys → Secret keys
//                           (starts with sb_secret_). NOT the sb_publishable_ key.
//                           Never put this in frontend code or GitHub.
//   SESSION_SECRET        — any long random string you invent (30+ characters).
//                           Used to sign login tokens so they can't be forged.

import crypto from "crypto";

// Creates a tamper-proof login token.
// The student's id travels in the token, but it is SIGNED with SESSION_SECRET.
// If anyone edits the token in their browser to another student's id, the
// signature stops matching and the server rejects it. Without this, a student
// could open developer tools and read another student's chat history.
function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!SUPABASE_URL || !SERVICE_KEY || !SESSION_SECRET) {
    console.error("Missing env vars: need SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET");
    return res.status(200).json({ ok: false, message: "Server setup adhoora hai. Teacher ko batao." });
  }

  try {
    const { login_number, password } = req.body || {};

    if (!login_number || !password) {
      return res.status(200).json({ ok: false, message: "Number aur password dono bharo." });
    }

    // Clean the number: strip spaces, dashes, +91 — students type it many ways.
    // The "-2" sibling suffix is preserved.
    const cleaned = String(login_number).trim().replace(/\s|\(|\)/g, "").replace(/^\+?91/, "");

    // Ask Supabase for this student. Runs server-side with the secret key.
    const url =
      SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/students?login_number=eq." +
      encodeURIComponent(cleaned) +
      "&select=student_id,name,password,active,class,district,xp_total";

    const r = await fetch(url, {
      headers: {
        // New-style Supabase keys (sb_secret_...) go ONLY on the apikey header.
        // They are not JWTs, so sending them as "Authorization: Bearer" fails.
        apikey: SERVICE_KEY,
      },
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Supabase error:", r.status, errText.slice(0, 300));
      return res.status(200).json({ ok: false, message: "Abhi problem hai. Thodi der baad try karo." });
    }

    const rows = await r.json();
    const student = rows && rows[0];

    // Same message whether the number is unknown or the password is wrong.
    // Telling them which one was wrong would let someone discover who has an account.
    if (!student || student.password !== password) {
      return res.status(200).json({ ok: false, message: "Number ya password galat hai. Phir se try karo." });
    }

    // Deactivated accounts: login blocked, but their history is kept in the database.
    if (student.active === false) {
      return res.status(200).json({ ok: false, message: "Yeh account abhi band hai. Apne teacher se baat karo." });
    }

    const token = signToken(
      { sid: student.student_id, name: student.name, iat: Date.now() },
      SESSION_SECRET
    );

    return res.status(200).json({
      ok: true,
      token,
      student: {
        student_id: student.student_id,
        name: student.name,
        class: student.class,
        district: student.district,
        xp_total: student.xp_total,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false, message: "Kuch problem ho gayi. Phir se try karo." });
  }
}
