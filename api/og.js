/* the link preview of a share link. vercel.json sends /f/<code> here only for link-preview bots (X, iMessage,
   Slack, Discord, ...); people get index.html. The answer is a tiny page: the names in og:title (escaped), a static picture
   per world and result (web/assets/og/<world>-<w|f>.jpg), and a plain link to the game.
   Nothing is stored and nothing is called. */
import { decodeLink, previewTitle } from '../web/src/share-link.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HOST = /^[a-z0-9.-]{1,120}(:\d{2,5})?$/i;

export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  const code = String(url.searchParams.get('code') || '').slice(0, 400);
  const d = decodeLink(code);
  const h = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const host = HOST.test(h) ? h : 'sage-quest-one.vercel.app';
  /* SQ_PUBLIC_ORIGIN (optional, e.g. https://sage-quest-one.vercel.app) pins the origin; else the request's own host, checked */
  const pinned = /^https:\/\/[a-z0-9.-]+$/i.test(process.env.SQ_PUBLIC_ORIGIN || '') ? process.env.SQ_PUBLIC_ORIGIN : null;
  const origin = pinned || `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`;
  const img = d ? `${origin}/assets/og/${d.w}-${d.r === 'f' ? 'f' : 'w'}.jpg` : `${origin}/assets/og.jpg`;
  const title = previewTitle(d);
  const desc = d ? (d.r === 'f' ? 'Same world, same enemy. Finish it in Sage Quest.' : 'Fight for someone in Sage Quest.') : 'Tell the game who you are, and the game builds your quest.';
  const page = d ? `${origin}/f/${code}` : `${origin}/`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Sage Quest">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(page)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
</head><body><a href="${esc(page)}">${esc(title)}</a></body></html>`;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=3600');
  res.setHeader('vary', 'User-Agent');
  res.setHeader('x-robots-tag', 'noindex');
  res.end(html);
}
