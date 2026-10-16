import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../Builds/WebGL');
const port=Number(process.env.PORT||5181);
if(!fs.existsSync(path.join(root,'index.html'))) { console.error('Build the WebGL game first: build-web.cmd'); process.exit(1); }
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)) {res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()) {res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`POKÉ LAB Unity WebGL: http://127.0.0.1:${port}/`));
