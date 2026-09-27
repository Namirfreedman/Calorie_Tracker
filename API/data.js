export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: "Missing KV credentials" });
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