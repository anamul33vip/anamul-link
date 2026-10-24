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
function renderSocial(social, contact, products) {
  const s = social || {}, c = contact || {};
  const setBtn = (id, url) => { const el = $(id); if (url) { el.href = url; el.classList.remove("hidden"); } else el.classList.add("hidden"); };
  setBtn("floatYoutube", s.youtube); setBtn("floatTiktok", s.tiktok); setBtn("floatTelegram", s.telegram);
  const anySocial = s.youtube || s.tiktok || s.telegram;
  $("socialFloat").classList.toggle("hidden", !anySocial);
  const list = products || [];
  const wa = c.whatsapp ? "https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent("Hi, ami apnar product somporke jante chai.") : "";
  if (list.length) {
    $("businessSection").classList.remove("hidden");
    $("businessList").innerHTML = list.map(pr => {
      const waLink = c.whatsapp ? "<a class=\"wa-button\" href=\"https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent("Hi, ami " + pr.title + " product somporke jante chai.") + "\" target=\"_blank\" rel=\"noopener noreferrer\">WhatsApp-e jogajog</a>" : "";
      return "<article class=\"product-card card\">" + (pr.photo_url ? "<img src=\"" + esc(pr.photo_url) + "\" alt=\"\">" : "") + "<h3>" + esc(pr.title) + "</h3>" + (pr.description ? "<p>" + esc(pr.description) + "</p>" : "") + (pr.link_url ? "<a class=\"demo-button\" href=\"" + esc(pr.link_url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Demo / Link dekhun</a>" : "") + waLink + "</article>";
    }).join("");
  } else {
    $("businessSection").classList.add("hidden");
  }
  if (c.whatsapp || c.phone) {
    $("businessContact").classList.remove("hidden");
    $("businessContact").innerHTML = (c.phone ? "<p class=\"muted\">Contact: " + esc(c.phone) + "</p>" : "") + (wa ? "<a class=\"wa-button\" href=\"" + wa + "\" target=\"_blank\" rel=\"noopener noreferrer\">WhatsApp-e jogajog</a>" : "");
  } else {
    $("businessContact").classList.add("hidden");
  }
}
async function loadConfig() {
  const c=await api("/api/public/config"); csrf=c.csrfToken; currentUser=c.user;
  $("year").textContent=new Date().getFullYear(); updateNav();
  renderSocial(c.social, c.contact, c.products);
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
    await loadConfig();
    // Do not claim success if the session cookie was not kept: without a
    // session, loadConfig leaves currentUser null and the header keeps
    // showing Login. That masked failure used to look like a login loop.
    if(!currentUser){$("authMessage").textContent="Signed in on the server, but your browser did not keep the session. Please allow cookies for this site and open it in Chrome (not an in-app browser), then try again.";return;}
    toast(authMode==="login"?"Welcome back":"Account created"); $("authPanel").classList.add("hidden");
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
    try {
      const sc = await api("/api/admin/social");
      $("socialYoutube").value = sc.social.youtube || ""; $("socialTiktok").value = sc.social.tiktok || ""; $("socialTelegram").value = sc.social.telegram || "";
      $("contactWhatsapp").value = sc.contact.whatsapp || ""; $("contactPhone").value = sc.contact.phone || "";
      const prods = await api("/api/admin/products");
      $("productsListAdmin").innerHTML = prods.length ? prods.map(pr => "<div class=\"link-item\"><div class=\"link-main\"><strong>" + esc(pr.title) + "</strong><div class=\"tiny\">" + (pr.active ? "Active" : "Paused") + (pr.link_url ? " · " + esc(pr.link_url) : "") + "</div></div><div class=\"link-actions\"><button data-prodtoggle=\"" + pr.id + "\">" + (pr.active ? "Pause" : "Activate") + "</button><button data-proddelete=\"" + pr.id + "\">Delete</button></div></div>").join("") : '<p class="muted">No business products yet.</p>';
      $("productsListAdmin").querySelectorAll("[data-prodtoggle]").forEach(b => b.addEventListener("click", async () => { try { await api("/api/admin/products/" + b.dataset.prodtoggle + "/toggle", { method: "POST", body: {} }); await loadAdmin(); } catch (e) { toast(e.message); } }));
      $("productsListAdmin").querySelectorAll("[data-proddelete]").forEach(b => b.addEventListener("click", async () => { if (!confirm("Delete this product?")) return; try { await api("/api/admin/products/" + b.dataset.proddelete, { method: "DELETE" }); await loadAdmin(); } catch (e) { toast(e.message); } }));
    } catch (e) { toast(e.message); }
    const users=await api("/api/admin/users");
    $("usersList").innerHTML=users.map(u=>`<div class="link-item"><div class="link-main"><strong>${esc(u.email)}</strong><div class="tiny">#${u.id} · ${esc(u.role)} · ${esc(u.created_at)}</div></div></div>`).join("");
  }catch(e){toast(e.message);}
}
$("saveSettings").addEventListener("click",async()=>{try{await api("/api/admin/settings",{method:"POST",body:{ad_enabled:$("adEnabled").checked,continue_seconds:Number($("continueSeconds").value)}});toast("Settings saved");}catch(e){toast(e.message);}});
$("adForm").addEventListener("submit",async e=>{e.preventDefault();try{let mediaUrl=$("adImage").value;const fileInput=$("adFile");if(fileInput&&fileInput.files&&fileInput.files[0]){const fd=new FormData();fd.append("file",fileInput.files[0]);const upRes=await fetch("/api/admin/upload",{method:"POST",headers:csrf?{"X-CSRF-Token":csrf}:{},body:fd});const upData=await upRes.json().catch(()=>({}));if(!upRes.ok)throw new Error(upData.error||"Upload failed");mediaUrl=upData.url;}await api("/api/admin/ads",{method:"POST",body:{title:$("adTitle").value,image_url:mediaUrl,destination_url:$("adDestination").value,body:$("adBody").value,step_number:Number($("adStep").value)||0}});$("adForm").reset();await loadAdmin();toast("Advertisement added");}catch(err){toast(err.message);}});
$("socialForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/api/admin/social", { method: "POST", body: { youtube: $("socialYoutube").value, tiktok: $("socialTiktok").value, telegram: $("socialTelegram").value, whatsapp: $("contactWhatsapp").value, phone: $("contactPhone").value } }); toast("Social & contact saved"); await loadConfig(); } catch (err) { toast(err.message); } });
$("productForm").addEventListener("submit", async e => { e.preventDefault(); try { let photoUrl = $("productPhoto").value; const fi = $("productFile"); if (fi && fi.files && fi.files[0]) { const fd = new FormData(); fd.append("file", fi.files[0]); const upRes = await fetch("/api/admin/upload", { method: "POST", headers: csrf ? { "X-CSRF-Token": csrf } : {}, body: fd }); const upData = await upRes.json().catch(() => ({})); if (!upRes.ok) throw new Error(upData.error || "Upload failed"); photoUrl = upData.url; } await api("/api/admin/products", { method: "POST", body: { title: $("productTitle").value, photo_url: photoUrl, link_url: $("productLink").value, description: $("productDesc").value } }); $("productForm").reset(); await loadAdmin(); await loadConfig(); toast("Product added"); } catch (err) { toast(err.message); } });
loadConfig().catch(e=>toast("Could not connect to server: "+e.message));
