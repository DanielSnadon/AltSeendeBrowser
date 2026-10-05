const {app,BrowserWindow,WebContentsView,session,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs'); const path=require('node:path'); const {pathToFileURL}=require('node:url');
const {engines,defaults,query,searchURL,address,blocked}=require('./core.cjs');
app.setName('AltSeende Browser');
const smoke=process.argv.includes('--smoke-test');
if(smoke) app.setPath('userData',path.join(app.getPath('temp'),'altseende-smoke-'+process.pid));
let win,settings,normal,privateSession,active,overlay=false,seq=0; const tabs=new Map(),downloads=[]; let denied=0;
const settingsFile=()=>path.join(app.getPath('userData'),'settings.json');
const shellURL=pathToFileURL(path.join(__dirname,'index.html')).href;
function save(){fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(settingsFile(),JSON.stringify(settings,null,2));}
function state(){return {tabs:[...tabs.values()].map(t=>({id:t.id,title:t.title,url:t.url,private:t.private,error:t.error})),active,overlay,settings,engines:Object.keys(engines),downloads,denied,extensions:normal.extensions.getAllExtensions().map(e=>({id:e.id,name:e.name,path:e.path})),version:process.versions.chrome};}
function publish(){if(win&&!win.isDestroyed())win.webContents.send('state',state());}
function layout(){if(!win)return;const [width,height]=win.getContentSize();for(const t of tabs.values()) {t.view.setVisible(t.id===active&&!overlay&&!!t.url);t.view.setBounds({x:0,y:92,width,height:Math.max(0,height-148)});}}
function setupSession(s){
 s.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));s.setPermissionCheckHandler(()=>false);
 s.webRequest.onBeforeRequest((d,cb)=>{let u;try{u=new URL(d.url);}catch{return cb({});}const cancel=settings.trackers&&blocked(u.hostname);if(cancel){denied++;publish();}if(!cancel&&settings.httpsOnly&&u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)){u.protocol='https:';return cb({redirectURL:u.href});}cb({cancel});});
 s.webRequest.onBeforeSendHeaders((d,cb)=>{if(settings.dnt){d.requestHeaders.DNT='1';d.requestHeaders['Sec-GPC']='1';}cb({requestHeaders:d.requestHeaders});});
 s.on('will-download',(_event,item)=>{const d={id:Date.now()+Math.random(),name:item.getFilename(),state:'progressing',received:0,total:item.getTotalBytes()};downloads.unshift(d);publish();item.on('updated',()=>{d.received=item.getReceivedBytes();publish();});item.once('done',(_e,status)=>{d.state=status;publish();});});
}
function current(){return tabs.get(active);}
function shortcut(wc){wc.on('before-input-event',(e,i)=>{if(i.type!=='keyDown')return; const match=Object.entries(settings.shortcuts).find(([,v])=>{const p=v.toLowerCase().split('+');return !!i.control===p.includes('control')&&!!i.shift===p.includes('shift')&&!!i.alt===p.includes('alt')&&!i.meta&&i.key.toLowerCase()===p.at(-1);});if(!match)return;e.preventDefault();const a=match[0];if(a==='newTab')newTab();else if(a==='privateTab')newTab('',true);else if(a==='closeTab')closeTab(active);else {overlay=a==='search';layout();win.webContents.focus();win.webContents.send('shortcut',a);}});}
function newTab(url='',priv=false){const id=++seq;const view=new WebContentsView({webPreferences:{session:priv?privateSession:normal,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});view.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');const t={id,view,url:'',title:priv?'Private tab':'New tab',private:priv,error:''};tabs.set(id,t);win.contentView.addChildView(view);active=id;overlay=false;const wc=view.webContents;shortcut(wc);
 wc.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))newTab(url,priv);return {action:'deny'};});
 wc.on('will-navigate',(e,url)=>{if(!/^https?:\/\//i.test(url))e.preventDefault();});
 wc.on('will-redirect',(e,url)=>{if(!/^https?:\/\//i.test(url))e.preventDefault();});
 wc.on('page-title-updated',(_e,title)=>{t.title=title;publish();});
 for(const name of ['did-navigate','did-navigate-in-page'])wc.on(name,(_e,url)=>{t.url=url;publish();});
 wc.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3){t.error=description;publish();}});
 wc.on('render-process-gone',()=>{t.error='Page process stopped. Reload this tab.';publish();});
 wc.on('context-menu',(_e,p)=>{Menu.buildFromTemplate([{label:'Read selected text',enabled:!!p.selectionText,click:()=>speak(p.selectionText)},{label:'Copy',role:'copy'},{label:'Paste',role:'paste'}]).popup({window:win});});
 if(url)navigate(url);layout();publish();return t;
}
function navigate(value){const t=current();if(!t)return;const url=address(value,settings);t.url=url;t.error='';overlay=false;layout();t.view.webContents.loadURL(url).catch(e=>{t.error=e.message;publish();});publish();}
function closeTab(id){const t=tabs.get(id);if(!t)return;win.contentView.removeChildView(t.view);t.view.webContents.close();tabs.delete(id);if(active===id)active=[...tabs.keys()].at(-1);if(!tabs.size)newTab();layout();publish();}
async function speak(text){overlay=true;layout();win.webContents.send('reader',text);}
ipcMain.handle('command',async(event,action,data)=>{
 if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==shellURL)throw Error('Untrusted sender');
 switch(action){
 case 'state':return state();
 case 'new':newTab('',!!data);break;
 case 'activate':if(tabs.has(data)){active=data;overlay=false;layout();publish();}break;
 case 'close':closeTab(data);break;
 case 'navigate':navigate(data);break;
 case 'back':if(current()?.view.webContents.navigationHistory.canGoBack())current().view.webContents.navigationHistory.goBack();break;
 case 'forward':if(current()?.view.webContents.navigationHistory.canGoForward())current().view.webContents.navigationHistory.goForward();break;
 case 'reload':current()?.view.webContents.reload();break;
 case 'overlay':overlay=!!data;layout();break;
 case 'search':{const q=query(data);if(!q)throw Error('Enter a query or search filter.');const selected=data.engines.filter(e=>engines[e]);if(!selected.length)throw Error('Choose at least one engine.');const priv=current()?.private;for(const e of selected)newTab(searchURL(q,e),priv);break;}
 case 'settings':{
 const next={...settings};for(const k of ['trackers','dnt','httpsOnly'])if(typeof data[k]==='boolean')next[k]=data[k];
 if(engines[data.engine])next.engine=data.engine;if(/^#[a-f0-9]{6}$/i.test(data.accent||''))next.accent=data.accent;
 if(['comfortable','compact'].includes(data.density))next.density=data.density;if(['mono','sans'].includes(data.font))next.font=data.font;
 if(data.shortcuts){const vals=Object.values(data.shortcuts);if(vals.length!==5||new Set(vals).size!==5||vals.some(x=>!/^(Control\+)(Shift\+)?(Alt\+)?[A-Za-z0-9]$/.test(x)))throw Error('Use unique shortcuts such as Control+Shift+F.');for(const k of Object.keys(defaults.shortcuts))if(typeof data.shortcuts[k]!=='string')throw Error('Missing shortcut');next.shortcuts=data.shortcuts;}
 settings=next;save();publish();break;}
 case 'clear':await Promise.all([normal.clearStorageData(),normal.clearCache(),privateSession.clearStorageData(),privateSession.clearCache()]);return 'Cookies, storage and cache cleared.';
 case 'read':{if(!current()?.url)throw Error('Open a page first, or paste text in Reader.');const text=await current().view.webContents.executeJavaScript("String(window.getSelection()) || document.body.innerText.slice(0,100000)");await speak(text);break;}
 case 'media':{if(!current()?.url)return [];const items=await current().view.webContents.executeJavaScript("Array.from(document.querySelectorAll('video,video source,a[href]')).map(e=>e.currentSrc||e.src||e.href).filter(u=>u && (/^https?:/.test(u))).filter((u,i,a)=>a.indexOf(u)===i)");return items.filter(u=>/\.(mp4|webm|ogg|mov)([?#]|$)/i.test(u)).slice(0,100);}
 case 'download':{const u=new URL(data);if(!['https:','http:'].includes(u.protocol))throw Error('A direct HTTP(S) media URL is required.');current().view.webContents.downloadURL(u.href);break;}
 case 'extension':{const r=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Select unpacked Chrome extension'});if(!r.canceled){const ext=await normal.extensions.loadExtension(r.filePaths[0]);settings.extensions=[...new Set([...settings.extensions,ext.path])];save();publish();}break;}
 case 'removeExtension':{const ext=normal.extensions.getExtension(data);if(ext){normal.extensions.removeExtension(data);settings.extensions=settings.extensions.filter(p=>p!==ext.path);save();publish();}break;}
 default:throw Error('Unknown command');
 }
 return state();
});
app.whenReady().then(async()=>{settings=structuredClone(defaults);try{settings={...settings,...JSON.parse(fs.readFileSync(settingsFile(),'utf8'))};}catch{}
 normal=session.fromPartition('persist:altseende');privateSession=session.fromPartition('altseende-private');setupSession(normal);setupSession(privateSession);
 for(const p of settings.extensions)try{await normal.extensions.loadExtension(p);}catch(e){console.error('Extension not loaded:',e.message);}
 Menu.setApplicationMenu(null);win=new BrowserWindow({width:1400,height:900,minWidth:900,minHeight:640,backgroundColor:'#090a0b',title:'AltSeende Browser',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());shortcut(win.webContents);win.on('resize',layout);win.on('closed',()=>{for(const t of tabs.values())t.view.webContents.close();tabs.clear();win=null;});
 await win.loadFile(path.join(__dirname,'index.html'));newTab();
 if(smoke)require('./smoke.cjs')({app,win,newTab,tabs,current,normal,privateSession,closeTab,state,settings});
});
app.on('window-all-closed',()=>app.quit());
