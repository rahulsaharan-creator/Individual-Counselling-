const fs=require('fs');
let h=fs.readFileSync('src.html','utf8');
h=h.replace('/*ENGINE*/',()=>fs.readFileSync('engine.js','utf8')).replace('/*DEFAULTS*/',()=>fs.readFileSync('defaults.json','utf8'));
fs.mkdirSync('dist',{recursive:true}); fs.writeFileSync('dist/index.html',h); console.log('built',h.length);
