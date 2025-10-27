const API = 'https://api.example.com'; // .env 縺ｧ蟾ｮ縺玲崛縺域Φ螳・
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
if(!res.ok) throw new Error(`API ${res.status}`);
return res.json();
}
