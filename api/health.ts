interface SimpleReq {
  method?: string;
}

interface SimpleRes {
  status: (code: number) => SimpleRes;
  json: (body: unknown) => void;
}

export default function handler(req: SimpleReq, res: SimpleRes) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
}
