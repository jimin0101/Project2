import {
  formatFriendlyError,
  runCertResearch,
  type CertResearchInput,
} from '../lib/certResearchService';

interface SimpleReq {
  method?: string;
  body?: unknown;
}

interface SimpleRes {
  setHeader?: (name: string, value: string) => void;
  status: (code: number) => SimpleRes;
  json: (body: unknown) => void;
}

export default async function handler(req: SimpleReq, res: SimpleRes) {
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const parsedBody: CertResearchInput =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as CertResearchInput)
        : ((req.body ?? {}) as CertResearchInput);

    const payload = await runCertResearch(parsedBody);
    return res.status(200).json(payload);
  } catch (err: unknown) {
    console.error('[api/cert-research] Error:', err);
    const friendly = formatFriendlyError(err);
    return res.status(friendly.status).json({ error: friendly.message });
  }
}
