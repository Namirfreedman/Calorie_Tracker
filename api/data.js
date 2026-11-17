import { timingSafeEqual } from "crypto";

// בדיקת מפתח סנכרון: אם APP_SECRET מוגדר ב-Vercel, כל בקשה חייבת לשלוח אותו בכותרת x-app-key.
// אם לא מוגדר — הגישה פתוחה (כמו קודם), כדי שהעדכון לא ישבור סנכרון לפני שהמפתח הוגדר.
function isAuthorized(req) {
  const secret = process.env.APP_SECRET;
  if (!secret) return true;
  const provided = req.headers["x-app-key"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  res.setHeader("Cache-Control", "no-store");

  if (!url || !token) {
    return res.status(500).json({ error: "Missing KV credentials" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // שמירת נתונים בענן
  if (req.method === "POST") {
    try {
      const body = req.body;
      const resp = await fetch(`${url}/set/user_health_data`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // משיכת נתונים מהענן
  if (req.method === "GET") {
    try {
      const resp = await fetch(`${url}/get/user_health_data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      let result = null;
      if (data && data.result) {
        result = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      }
      return res.status(200).json({ result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
