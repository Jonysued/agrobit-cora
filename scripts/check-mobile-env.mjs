import { loadEnv } from 'vite';

const config = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const url = new URL(config.VITE_SUPABASE_URL || 'https://invalid.local');
if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Configure the public Supabase project URL before building mobile.');
const key = config.VITE_SUPABASE_ANON_KEY || '';
if (!key.startsWith('sb_publishable_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* handled below */ }
  if (role !== 'anon') throw new Error('Mobile requires a publishable or anon key. Never bundle a service role or secret key.');
}
console.log('Mobile public configuration verified');
