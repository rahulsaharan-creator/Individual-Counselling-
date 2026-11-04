const fs=require('fs');
// Analytics endpoint: the Google Apps Script web app URL, kept in analytics-url.txt (empty = analytics off).
const url=(fs.existsSync('analytics-url.txt')?fs.readFileSync('analytics-url.txt','utf8'):'').trim();
const version=new Date().toISOString().slice(0,10);
const analytics=fs.readFileSync('analytics.js','utf8').replace('__ANALYTICS_URL__',url).replace('__APP_VERSION__',version);
let h=fs.readFileSync('src.html','utf8');
h=h.replace('/*ANALYTICS*/',()=>analytics).replace('/*ENGINE*/',()=>fs.readFileSync('engine.js','utf8')).replace('/*DEFAULTS*/',()=>fs.readFileSync('defaults.json','utf8'));
fs.mkdirSync('dist',{recursive:true}); fs.writeFileSync('dist/index.html',h); console.log('built',h.length,url?'analytics on':'analytics OFF (no URL)');
