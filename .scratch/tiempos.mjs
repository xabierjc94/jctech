import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const BASE = "https://jctech-jctech1.vercel.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data } = await anon.auth.signInWithPassword({ email:"dev@jctech.local", password:"DevPanel1234!" });
const ref = url.match(/https:\/\/([^.]+)\./)[1];
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64")}`;

const rutas = ["/dashboard","/conversaciones","/citas","/personalizacion?tab=general","/personalizacion?tab=servicios","/personalizacion?tab=horarios","/integraciones"];
console.log("ruta".padEnd(34), "1ª(ms)  2ª(ms)  3ª(ms)   región");
for (const p of rutas) {
  const t = [];
  let region = "";
  for (let i=0;i<3;i++) {
    const a = Date.now();
    const res = await fetch(BASE+p, { headers:{cookie}, redirect:"manual" });
    await res.text();
    t.push(Date.now()-a);
    region = res.headers.get("x-vercel-id") ?? "";
  }
  console.log(p.padEnd(34), String(t[0]).padStart(6), String(t[1]).padStart(7), String(t[2]).padStart(7), "  ", region.split("::")[0]);
}
