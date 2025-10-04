const API = 'https://api.example.com'; // .env で差し替え想定
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
if(!res.ok) throw new Error(`API ${res.status}`);
return res.json();
}