// Isolated actual-editor fixture, no production configuration or client.
import {createServer} from 'vite';
const server=await createServer({configFile:false,base:'/',server:{host:'127.0.0.1',port:5320,strictPort:true,headers:{'Content-Security-Policy':"connect-src 'self' ws://127.0.0.1:5320; form-action 'none'; object-src 'none'"}}});
await server.listen();
console.log('Synthetic editor: http://127.0.0.1:5320/tests/browser/estimating-workspace.html');
