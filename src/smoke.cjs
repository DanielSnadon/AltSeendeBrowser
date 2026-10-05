const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
module.exports=async({app,win,newTab,tabs,current,normal,privateSession,closeTab,state})=>{let server;try{
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Smoke page</title><h1>Chromium test page</h1><video src="/sample.mp4"></video>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 assert.equal(await win.webContents.executeJavaScript('typeof window.alt.command'),'function');
 const t=newTab(url);await new Promise((resolve,reject)=>{t.view.webContents.once('did-finish-load',resolve);setTimeout(()=>reject(Error('Page load timeout')),15000).unref();});
 assert.equal(await t.view.webContents.executeJavaScript('typeof process'),'undefined');assert.equal(await t.view.webContents.executeJavaScript('typeof require'),'undefined');assert.equal(await t.view.webContents.executeJavaScript('typeof window.alt'),'undefined');assert.equal(t.title,'Smoke page');
 await normal.cookies.set({url,name:'normal',value:'yes'});assert.equal((await privateSession.cookies.get({url})).length,0);
 const p=newTab('',true);assert.equal(p.view.webContents.session,privateSession);closeTab(p.id);assert.equal(current().id,t.id);
 await win.webContents.executeJavaScript("window.alt.command('search',{text:'test',engines:['Google','Yandex','DuckDuckGo']})");assert.equal(tabs.size,5);
 for(const t of [...tabs.values()])if(t.url)closeTab(t.id);
 await win.webContents.executeJavaScript("document.querySelector('[data-panel=settings]').click()");await new Promise(r=>setTimeout(r,250));assert.equal(await win.webContents.executeJavaScript("document.querySelector('#panel-title').textContent"),'Make room for your way.');
 await win.webContents.executeJavaScript("document.querySelector('#close-panel').click()");await new Promise(r=>setTimeout(r,250));
 const outputDir=app.isPackaged?app.getPath('userData'):path.join(__dirname,'../docs');fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,'preview.png'),(await win.webContents.capturePage()).toPNG());
 console.log('SMOKE PASS: shell bridge, real page, Node isolation, private cookies, tabs, multi-search, settings, screenshot');server.close();app.exit(0);
 }catch(e){console.error(e);server?.close();app.exit(1);}};
