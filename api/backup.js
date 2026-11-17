import { timingSafeEqual } from "crypto";

// גיבוי שבועי: שומר עותק של הנתונים בכל יום ראשון (שעון ישראל), שומר 8 גיבויים אחרונים.
// מופעל אוטומטית ע"י Vercel Cron בימי ראשון, וגם ע"י האפליקציה בפתיחה (יוצר גיבוי רק אם חסר לשבוע הזה).
const DATA_KEY = "user_health_data";
const LIST_KEY = "user_health_backups";
const KEEP = 8;

function isAuthorized(req) {
  const ua = req.headers["user-agent"] || "";
  if (ua.startsWith("vercel-cron/")) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
  const secret = process.env.APP_SECRET;
  if (!secret) return true;
  const provided = req.headers["x-app-key"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// תאריך (YYYY-MM-DD) של יום ראשון האחרון לפי שעון ישראל
function lastSundayIL() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  now.setDate(now.getDate() - now.getDay());
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  res.setHeader("Cache-Control", "no-store");
  if (!url || !token) return res.status(500).json({ error: "Missing KV credentials" });
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const redis = async (cmd) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(cmd),
    });
    return (await r.json()).result;
  };

  try {
    // רשימת גיבויים
    if (req.method === "GET" && req.query && req.query.list) {
      return res.status(200).json({ backups: (await redis(["LRANGE", LIST_KEY, 0, KEEP - 1])) || [] });
    }
    // גיבוי מסוים לשחזור
    if (req.method === "GET" && req.query && req.query.date) {
      const raw = await redis(["GET", `${LIST_KEY}:${req.query.date}`]);
      return res.status(200).json({ result: raw ? JSON.parse(raw) : null });
    }

    // יצירת גיבוי אם עוד אין גיבוי מיום ראשון האחרון
    const sunday = lastSundayIL();
    const list = (await redis(["LRANGE", LIST_KEY, 0, 0])) || [];
    if (list[0] && list[0] >= sunday) return res.status(200).json({ created: false, latest: list[0] });

    let data = await redis(["GET", DATA_KEY]);
    if (!data) return res.status(200).json({ created: false, reason: "no data" });
    if (typeof data !== "string") data = JSON.stringify(data);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    await redis(["SET", `${LIST_KEY}:${today}`, data, "EX", 60 * 60 * 24 * 7 * (KEEP + 2)]);
    await redis(["LPUSH", LIST_KEY, today]);
    await redis(["LTRIM", LIST_KEY, 0, KEEP - 1]);
    return res.status(200).json({ created: true, date: today });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
