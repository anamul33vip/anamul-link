const $ = id => document.getElementById(id);
let csrf = "";
let authMode = "login";
let currentUser = null;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
async function api(url, options={}) {
  const headers = { ...(options.headers||{}) };
  if (options.body && typeof options.body !== "string") { headers["Content-Type"]="application/json"; options.body=JSON.stringify(options.body); }
  if (options.method && !["GET","HEAD"].includes(options.method.toUpperCase()) && csrf) headers["X-CSRF-Token"]=csrf;
  const res=await fetch(url,{...options,headers,credentials:"same-origin"});
  const data=await res.json().catch(()=>({error:"Unexpected server response"}));
  if(!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function showAuth(mode) {
  authMode=mode; $("authPanel").classList.remove("hidden"); $("authPanel").scrollIntoView({behavior:"smooth",block:"center"});
  $("authTitle").textContent=mode==="login"?"Welcome back":"Create your account";
  $("authSubtitle").textContent=mode==="login"?"Sign in to manage your links.":"Create an account to save links and see click statistics.";
  $("authSubmit").textContent=mode==="login"?"Login":"Create account";
  $("password").autocomplete=mode==="login"?"current-password":"new-password";
  $("authSwitch").innerHTML=mode==="login"?'New here? <button class="inline-link" id="switchAuth">Create an account</button>':'Already have an account? <button class="inline-link" id="switchAuth">Login</button>';
  $("switchAuth").addEventListener("click",()=>showAuth(authMode==="login"?"register":"login"));
  $("authMessage").textContent="";
}
function updateNav() {
  $("navLogin").classList.toggle("hidden",!!currentUser);
  $("navRegister").classList.toggle("hidden",!!currentUser);
  $("navDashboard").classList.toggle("hidden",!currentUser);
  $("navLogout").classList.toggle("hidden",!currentUser);
  $("navAdmin").classList.toggle("hidden",!currentUser||currentUser.role!=="admin");
}
async function loadConfig() {
  const c=await api("/api/public/config"); csrf=c.csrfToken; currentUser=c.user;
  $("year").textContent=new Date().getFullYear(); updateNav();
  if(currentUser) { $("authPanel").classList.add("hidden"); await loadDashboard(); }
}
$("navLogin").addEventListener("click",()=>showAuth("login"));
$("navRegister").addEventListener("click",()=>showAuth("register"));
$("closeAuth").addEventListener("click",()=>$("authPanel").classList.add("hidden"));
$("navDashboard").addEventListener("click",()=>{$("dashboard").scrollIntoView({behavior:"smooth"});loadDashboard();});
$("navAdmin").addEventListener("click",()=>{$("adminPanel").scrollIntoView({behavior:"smooth"});loadAdmin();});
$("navLogout").addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST",body:{}});currentUser=null;$("dashboard").classList.add("hidden");$("adminPanel").classList.add("hidden");updateNav();toast("Signed out");}catch(e){toast(e.message);}});
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault(); const body={email:$("email").value,password:$("password").value};
  try{
    await api("/api/auth/"+authMode,{method:"POST",body});
    await loadConfig(); toast(authMode==="login"?"Welcome back":"Account created"); $("authPanel").classList.add("hidden");
  }catch(err){$("authMessage").textContent=err.message;}
});
$("shortenBtn").addEventListener("click",async()=>{
  const url=$("urlInput").value.trim(); if(!url){toast("Paste a URL first");return;}
  try {
    if(!currentUser){showAuth("register");$("authMessage").textContent="Create a free account to save and manage your short links.";return;}
    const result=await api("/api/links",{method:"POST",body:{url,title:$("titleInput").value,customCode:$("customInput").value}});
    $("shortResult").classList.remove("hidden");
    $("shortResult").innerHTML=`<strong>Your short link is ready</strong><div class="result-line"><a href="${esc(result.short_url)}" target="_blank" rel="noopener noreferrer">${esc(result.short_url)}</a><button id="copyNew">Copy</button></div>`;
    $("copyNew").addEventListener("click",()=>copyText(result.short_url)); $("customInput").value=""; $("titleInput").value=""; await loadDashboard(); toast("Short link created");
  }catch(e){toast(e.message);}
});
async function copyText(text){try{await navigator.clipboard.writeText(text);toast("Copied to clipboard");}catch{prompt("Copy your link:",text);}}
function linkItem(l){
  return `<div class="link-item"><div class="link-main"><strong>${esc(l.title||l.target_url)}</strong><a href="${esc(l.short_url)}" target="_blank" rel="noopener noreferrer">${esc(l.short_url)}</a><div class="tiny">${Number(l.clicks||0)} clicks · ${l.active?"Active":"Paused"} · Destination: ${esc(l.target_url)}</div></div><div class="link-actions"><button data-copy="${esc(l.short_url)}">Copy</button><button data-toggle="${l.id}">${l.active?"Pause":"Activate"}</button><button data-delete="${l.id}">Delete</button></div></div>`;
}
async function loadDashboard(){
  if(!currentUser)return;
  try{
    const d=await api("/api/me"); $("dashboard").classList.remove("hidden"); $("welcomeEmail").textContent=d.user.email;
    $("statLinks").textContent=d.links.length; $("statClicks").textContent=d.totalClicks;
    $("linksTable").innerHTML=d.links.length?d.links.map(linkItem).join(""):'<p class="muted">No links yet. Create one above.</p>';
    $("linksTable").querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>copyText(b.dataset.copy)));
    $("linksTable").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this link and its click history?"))return;try{await api("/api/links/"+b.dataset.delete,{method:"DELETE"});await loadDashboard();toast("Link deleted");}catch(e){toast(e.message);}}));
    $("linksTable").querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{try{await api("/api/links/"+b.dataset.toggle+"/toggle",{method:"POST",body:{}});await loadDashboard();}catch(e){toast(e.message);}}));
    const key=await api("/api/api-key"); $("apiKey").textContent=key.api_key;
  }catch(e){if(e.message.includes("sign in")){currentUser=null;updateNav();}else toast(e.message);}
}
$("refreshDashboard").addEventListener("click",loadDashboard);
$("rotateApiKey").addEventListener("click",async()=>{if(!confirm("Rotate API key? Your existing integrations will stop working."))return;try{const d=await api("/api/api-key/rotate",{method:"POST",body:{}});$("apiKey").textContent=d.api_key;toast("API key rotated");}catch(e){toast(e.message);}});
async function loadAdmin(){
  if(!currentUser||currentUser.role!=="admin")return;
  try{
    const d=await api("/api/admin/overview");
    $("adminPanel").classList.remove("hidden"); $("adminUsers").textContent=d.users;$("adminLinks").textContent=d.links;$("adminClicks").textContent=d.clicks;$("adminAds").textContent=d.ads;
    $("adEnabled").checked=d.adEnabled;$("continueSeconds").value=d.continueSeconds;
    const ads=await api("/api/admin/ads");
    $("adsList").innerHTML=ads.length?ads.map(a=>`<div class="link-item"><div class="link-main"><strong>${esc(a.title)}</strong><div class="tiny">${a.active?"Active":"Paused"} ${a.step_number?"· Step "+a.step_number:"· Any step"} ${a.image_url?(a.image_url.match(/\.(mp4|webm|mov)/i)||a.image_url.includes("youtube")?"· Video":"· Image"):""} ${a.destination_url?"· "+esc(a.destination_url):""}</div></div><div class="link-actions"><button data-adtoggle="${a.id}">${a.active?"Pause":"Activate"}</button><button data-addelete="${a.id}">Delete</button></div></div>`).join(""):'<p class="muted">No ads yet.</p>';
    $("stepSlots").innerHTML=[1,2,3,4,5,6,7,8].map(step=>{const ad=ads.find(x=>x.step_number===step);return `<div class="link-item"><div class="link-main"><strong>Step ${step}</strong><div class="tiny">${ad?esc(ad.title)+(ad.active?" · Active":" · Paused"):"Empty - no ad for this step yet"}</div></div><div class="link-actions"><button data-stepslot="${step}">Use this slot</button></div></div>`}).join("");
    $("stepSlots").querySelectorAll("[data-stepslot]").forEach(b=>b.addEventListener("click",()=>{$("adStep").value=b.dataset.stepslot;$("adForm").scrollIntoView({behavior:"smooth"});}));
    $("adsList").querySelectorAll("[data-adtoggle]").forEach(b=>b.addEventListener("click",async()=>{try{await api("/api/admin/ads/"+b.dataset.adtoggle+"/toggle",{method:"POST",body:{}});await loadAdmin();}catch(e){toast(e.message);}}));
    $("adsList").querySelectorAll("[data-addelete]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this ad?"))return;try{await api("/api/admin/ads/"+b.dataset.addelete,{method:"DELETE"});await loadAdmin();}catch(e){toast(e.message);}}));
    const users=await api("/api/admin/users");
    $("usersList").innerHTML=users.map(u=>`<div class="link-item"><div class="link-main"><strong>${esc(u.email)}</strong><div class="tiny">#${u.id} · ${esc(u.role)} · ${esc(u.created_at)}</div></div></div>`).join("");
  }catch(e){toast(e.message);}
}
$("saveSettings").addEventListener("click",async()=>{try{await api("/api/admin/settings",{method:"POST",body:{ad_enabled:$("adEnabled").checked,continue_seconds:Number($("continueSeconds").value)}});toast("Settings saved");}catch(e){toast(e.message);}});
$("adForm").addEventListener("submit",async e=>{e.preventDefault();try{let mediaUrl=$("adImage").value;const fileInput=$("adFile");if(fileInput&&fileInput.files&&fileInput.files[0]){const fd=new FormData();fd.append("file",fileInput.files[0]);const upRes=await fetch("/api/admin/upload",{method:"POST",headers:csrf?{"X-CSRF-Token":csrf}:{},body:fd});const upData=await upRes.json().catch(()=>({}));if(!upRes.ok)throw new Error(upData.error||"Upload failed");mediaUrl=upData.url;}await api("/api/admin/ads",{method:"POST",body:{title:$("adTitle").value,image_url:mediaUrl,destination_url:$("adDestination").value,body:$("adBody").value,step_number:Number($("adStep").value)||0}});$("adForm").reset();await loadAdmin();toast("Advertisement added");}catch(err){toast(err.message);}});
loadConfig().catch(e=>toast("Could not connect to server: "+e.message));
