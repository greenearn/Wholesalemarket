(function(){
/* Independent admin panel for the mini app. Stored in the shop's own GitHub
   repo (a JSON file written through the GitHub API), so it needs no server and
   keeps working when the bot is unreachable. */
var K = "wmadm_";
function ls(k,d){ try{ var v=localStorage.getItem(K+k); return v===null?d:v; }catch(e){ return d; } }
function lss(k,v){ try{ localStorage.setItem(K+k,v); }catch(e){} }

/* Owner and repo are read from the page address, so the only thing ever typed
   is the token. */
function auto(){
  var o="", r="";
  try{
    var h = String(location.hostname||"");
    var i = h.indexOf(".github.io");
    if(i > 0){ o = h.substring(0,i); }
    var p = String(location.pathname||"").split("/").filter(function(x){ return x; });
    if(p.length && p[0].indexOf(".") < 0){ r = p[0]; }
  }catch(e){}
  return {o:o, r:r};
}
function cfg(){
  var a = auto();
  return {o: ls("o",a.o), r: ls("r",a.r), p: ls("p","data.json"), t: ls("t","")};
}
function ready(c){ return !!(c.o && c.r && c.t); }

var D = null, SHA = "", TAB = "dep", MSG = "", MSGERR = false;

function blank(){
  return {version:1, accounts:[], deposits:[], withdrawals:[], users:{}, admins:[]};
}
/* UTF-8 safe base64. The deprecated escape/unescape pair was used first and the
   platform's guard refused the whole file for it, which is fair: that pair is
   the standard way to hide a payload. TextEncoder does the same job openly. */
function b64e(s){
  var b = new TextEncoder().encode(String(s||""));
  return btoa(new TextDecoder("latin1").decode(b));
}
function b64d(s){
  var bin = atob(String(s||"").replace(/\s/g,""));
  var u = new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++){ u[i] = bin.charCodeAt(i); }
  return new TextDecoder().decode(u);
}
function api(c){ return "https://api.github.com/repos/" + c.o + "/" + c.r + "/contents/" + c.p; }
function hd(c){
  return {Authorization:"Bearer " + c.t, Accept:"application/vnd.github+json", "Content-Type":"application/json"};
}

function load(cb){
  var c = cfg();
  if(!ready(c)){ D = blank(); cb("nocfg"); return; }
  fetch(api(c) + "?t=" + Date.now(), {headers:hd(c), cache:"no-store"}).then(function(r){
    if(r.status === 404){ SHA = ""; D = blank(); cb("empty"); return; }
    if(r.status === 401 || r.status === 403){ cb("auth"); return; }
    return r.json().then(function(j){
      SHA = j && j.sha ? j.sha : "";
      var d = blank();
      try{
        var o = JSON.parse(b64d(j && j.content ? j.content : ""));
        if(o && typeof o === "object"){
          d.version = o.version || 1;
          d.accounts = o.accounts || [];
          d.deposits = o.deposits || [];
          d.withdrawals = o.withdrawals || [];
          d.users = o.users || {};
          d.admins = o.admins || [];
        }
      }catch(e){}
      D = d; cb("ok");
    });
  }).catch(function(){ cb("net"); });
}

function save(cb){
  var c = cfg();
  if(!ready(c) || !D){ cb("nocfg"); return; }
  D.version = Date.now();
  var body = {message:"shop data " + new Date().toISOString(), content: b64e(JSON.stringify(D))};
  if(SHA){ body.sha = SHA; }
  fetch(api(c), {method:"PUT", headers:hd(c), body:JSON.stringify(body)}).then(function(r){
    return r.json().then(function(j){
      if(j && j.content && j.content.sha){ SHA = j.content.sha; }
      /* 409 means the file changed since it was read: report it instead of
         overwriting somebody else's save. */
      cb(r.ok ? "ok" : (r.status === 409 ? "conflict" : "error"));
    });
  }).catch(function(){ cb("net"); });
}

function money(n){ return "$" + (Math.round((Number(n)||0)*100)/100).toFixed(2); }
function esc(s){
  return String(s===null||s===undefined?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function bal(id){
  if(!D || !D.users){ return 0; }
  var r = D.users[String(id)];
  return r ? Number(r.bal||0) : 0;
}
function setBal(id, v){
  if(!D.users){ D.users = {}; }
  var k = String(id);
  if(!D.users[k]){ D.users[k] = {}; }
  D.users[k].bal = Math.round((Number(v)||0)*100)/100;
}

var CSS = "#wma{position:fixed;inset:0;z-index:9999;background:#0a0d16;color:#e8ecf6;" +
  "font-family:system-ui,sans-serif;overflow:auto;padding:14px}" +
  "#wma h1{font-size:17px;margin:0 0 10px}" +
  "#wma .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}" +
  "#wma .tab{padding:7px 11px;border:1px solid #2a3350;border-radius:10px;font-size:12px;cursor:pointer}" +
  "#wma .on{background:#2563eb;border-color:#3b82f6}" +
  "#wma .card{background:#111827;border:1px solid #263149;border-radius:12px;padding:11px;margin-bottom:9px}" +
  "#wma .b{padding:8px 12px;border-radius:9px;font-size:12px;cursor:pointer;margin:4px 4px 0 0}" +
  "#wma input{width:100%;box-sizing:border-box;border:1px solid #263149;border-radius:9px;padding:8px;font-size:13px;margin:4px 0}" +
  "#wma .m{font-size:12px;line-height:1.5}" +
  "#wma .ok{color:#6ee7b7}#wma .bad{color:#fca5a5}" +
  "#wma .x{float:right;border-radius:8px;padding:6px 10px;cursor:pointer}";

function open(){
  if(document.getElementById("wma")){ refresh(); return; }
  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);
  var d = document.createElement("div");
  d.id = "wma";
  d.innerHTML = '<button class="x" onclick="WMA.close()">X</button><div id="wmabody"></div>';
  document.body.appendChild(d);
  refresh();
}
function close(){
  var el = document.getElementById("wma");
  if(el){ el.parentNode.removeChild(el); }
}

function refresh(){
  load(function(st){
    if(st === "nocfg"){ MSG = "Set a GitHub token under Storage to switch saving on."; MSGERR = false; }
    else if(st === "auth"){ MSG = "GitHub refused the token. It needs Contents: read and write on this repo."; MSGERR = true; }
    else if(st === "net"){ MSG = "Could not reach GitHub."; MSGERR = true; }
    else { MSG = ""; }
    draw();
  });
}
function act(fn){
  fn(function(st){
    if(st === "ok"){ MSG = "Saved."; MSGERR = false; }
    else if(st === "conflict"){ MSG = "Someone else changed the file. Reopen and check before saving again."; MSGERR = true; }
    else if(st === "auth"){ MSG = "GitHub refused the token."; MSGERR = true; }
    else if(st === "nocfg"){ MSG = "Storage is not set up yet."; MSGERR = true; }
    else { MSG = "Could not save to GitHub."; MSGERR = true; }
    draw();
  });
}

function draw(){
  var el = document.getElementById("wmabody");
  if(!el || !D){ return; }
  var c = cfg();
  var h = '<h1>Admin</h1>';
  if(MSG){ h += '<div class="card"><div class="m ' + (MSGERR ? "bad" : "ok") + '">' + esc(MSG) + '</div></div>'; }
  if(!ready(c)){ el.innerHTML = h + setupHtml(c); return; }
  var pend = 0, wp = 0, i;
  for(i=0;i<D.deposits.length;i++){ if(D.deposits[i].status === "pending"){ pend++; } }
  for(i=0;i<D.withdrawals.length;i++){ if(D.withdrawals[i].status === "pending"){ wp++; } }
  h += '<div class="tabs">' + tabBtn("dep","Deposits " + pend) + tabBtn("wd","Withdrawals " + wp) +
       tabBtn("acc","Accounts " + D.accounts.length) + tabBtn("team","Team " + D.admins.length) + tabBtn("set","Storage") + '</div>';
  if(TAB === "dep"){ h += depHtml(); }
  else if(TAB === "wd"){ h += wdHtml(); }
  else if(TAB === "acc"){ h += accHtml(); }
  else if(TAB === "team"){ h += teamHtml(); }
  else { h += setupHtml(c); }
  el.innerHTML = h;
}
function tabBtn(k,label){
  return '<div class="tab' + (TAB === k ? " on" : "") + '" onclick="WMA.tab(\'' + k + '\')">' + esc(label) + '</div>';
}

function depHtml(){
  if(!D.deposits.length){ return '<div class="card"><div class="m">No deposit request yet. Customers send them from the wallet screen.</div></div>'; }
  var h = "", i, d, st;
  for(i=D.deposits.length-1;i>=0;i--){
    d = D.deposits[i];
    st = String(d.status||"pending");
    h += '<div class="card"><div><b>' + money(d.amount) + '</b> ' + esc(d.method||"manual") + '</div>';
    h += '<div class="m">User ' + esc(d.user) + ' · ' + esc(st) + ' · ' + esc(d.date||"") + '</div>';
    if(d.note){ h += '<div class="m">' + esc(String(d.note).substring(0,150)) + '</div>'; }
    h += '<div class="m">Balance now ' + money(bal(d.user)) + '</div>';
    if(st === "pending"){
      h += '<button class="b" onclick="WMA.depOk(' + i + ')">Approve + credit</button>';
      h += '<button class="b" onclick="WMA.depNo(' + i + ')">Reject</button>';
    }
    h += '</div>';
  }
  return h;
}
function depOk(i){
  var d = D.deposits[i];
  if(!d || d.status !== "pending"){ return; }
  setBal(d.user, bal(d.user) + Number(d.amount||0));
  d.status = "approved";
  d.done = new Date().toISOString().substring(0,10);
  act(save);
}
function depNo(i){
  var d = D.deposits[i];
  if(!d || d.status !== "pending"){ return; }
  d.status = "rejected";
  d.done = new Date().toISOString().substring(0,10);
  act(save);
}

function wdHtml(){
  if(!D.withdrawals.length){ return '<div class="card"><div class="m">No withdrawal request yet.</div></div>'; }
  var h = "", i, w, st;
  for(i=D.withdrawals.length-1;i>=0;i--){
    w = D.withdrawals[i];
    st = String(w.status||"pending");
    h += '<div class="card"><div><b>' + money(w.amount) + '</b> ' + esc(st) + '</div>';
    h += '<div class="m">User ' + esc(w.user) + ' · ' + esc(w.date||"") + '</div>';
    if(w.wallet){ h += '<div class="m">Send to ' + esc(w.wallet) + '</div>'; }
    if(st === "pending"){
      h += '<button class="b" onclick="WMA.wdOk(' + i + ')">Mark paid</button>';
      h += '<button class="b" onclick="WMA.wdNo(' + i + ')">Reject + refund</button>';
    }
    h += '</div>';
  }
  return h;
}
function wdOk(i){
  var w = D.withdrawals[i];
  if(!w || w.status !== "pending"){ return; }
  w.status = "paid";
  w.done = new Date().toISOString().substring(0,10);
  act(save);
}
function wdNo(i){
  var w = D.withdrawals[i];
  if(!w || w.status !== "pending"){ return; }
  /* The amount was taken when the request was made, so rejecting returns it
     exactly once. */
  setBal(w.user, bal(w.user) + Number(w.amount||0));
  w.status = "rejected";
  w.done = new Date().toISOString().substring(0,10);
  act(save);
}

function accHtml(){
  var h = '<div class="card"><b>Receiving accounts</b>' +
    '<div class="m">Shown to customers when they deposit.</div>' +
    '<input id="al" placeholder="Label, e.g. USDT TRC20">' +
    '<input id="ad" placeholder="Address or IBAN">' +
    '<input id="an" placeholder="Note, optional">' +
    '<button class="b" onclick="WMA.accAdd()">Add account</button></div>';
  if(!D.accounts.length){ return h + '<div class="card"><div class="m">No account yet.</div></div>'; }
  var i, a;
  for(i=0;i<D.accounts.length;i++){
    a = D.accounts[i];
    h += '<div class="card"><b>' + esc(a.label) + '</b><div class="m">' + esc(a.detail) + '</div>';
    if(a.note){ h += '<div class="m">' + esc(a.note) + '</div>'; }
    h += '<button class="b" onclick="WMA.accToggle(' + i + ')">' + (a.active === false ? "Show" : "Hide") + '</button>';
    h += '<button class="b" onclick="WMA.accDel(' + i + ')">Delete</button></div>';
  }
  return h;
}
function val(id){ var e = document.getElementById(id); return e ? String(e.value||"").trim() : ""; }
function accAdd(){
  var l = val("al"), d = val("ad"), n = val("an");
  if(l.length < 2 || d.length < 5){ MSG = "Label and account are both needed."; MSGERR = true; draw(); return; }
  D.accounts.push({id:"a" + Date.now(), label:l.substring(0,60), detail:d.substring(0,300), note:n.substring(0,200), active:true});
  act(save);
}
function accToggle(i){ var a = D.accounts[i]; if(a){ a.active = (a.active === false); act(save); } }
function accDel(i){ if(D.accounts[i]){ D.accounts.splice(i,1); act(save); } }

function teamHtml(){
  var h = '<div class="card"><b>Equal admins</b>' +
    '<div class="m">Everyone listed here can run this panel from their own phone, so losing one account never locks you out.</div>' +
    '<input id="tadm" placeholder="Telegram user id" inputmode="numeric">' +
    '<button class="b" onclick="WMA.teamAdd()">Make equal admin</button></div>';
  if(!D.admins.length){ return h + '<div class="card"><div class="m">No extra admin yet.</div></div>'; }
  var i;
  for(i=0;i<D.admins.length;i++){
    h += '<div class="card"><b>' + esc(D.admins[i]) + '</b><button class="b" onclick="WMA.teamDel(' + i + ')">Remove</button></div>';
  }
  return h;
}
function teamAdd(){
  var id = val("tadm"), i;
  if(!/^[0-9]{5,}$/.test(id)){ MSG = "That is not a Telegram user id. Digits only."; MSGERR = true; draw(); return; }
  for(i=0;i<D.admins.length;i++){ if(String(D.admins[i]) === id){ MSG = "Already an admin."; MSGERR = false; draw(); return; } }
  D.admins.push(id);
  act(save);
}
function teamDel(i){ if(D.admins[i]){ D.admins.splice(i,1); act(save); } }

function setupHtml(c){
  var h = '<div class="card"><b>Storage · GitHub</b>' +
    '<div class="m">The shop keeps its data in a file in your own repo, read and written through the GitHub API. No server, no bot.</div>' +
    '<input id="go" placeholder="GitHub owner" value="' + esc(c.o) + '">' +
    '<input id="gr" placeholder="Repository" value="' + esc(c.r) + '">' +
    '<input id="gp" placeholder="Data file" value="' + esc(c.p) + '">' +
    '<input id="gt" placeholder="Fine-grained token, Contents read and write">' +
    '<button class="b" onclick="WMA.setupSave()">Save</button>' +
    '<button class="b" onclick="WMA.test()">Test</button>' +
    '<div class="m" style="margin-top:10px">Make the token at GitHub, Settings, Developer settings, Personal access tokens, Fine-grained. Give it this repository only, with Contents set to read and write.</div>' +
    '<div class="m bad" style="margin-top:8px">Anyone holding that token can write to the repo. Limit it to this one repo and revoke it if the phone is lost.</div></div>';
  return h;
}
function setupSave(){
  lss("o", val("go")); lss("r", val("gr")); lss("p", val("gp") || "data.json");
  var t = val("gt");
  if(t){ lss("t", t); }
  MSG = "Settings saved."; MSGERR = false;
  refresh();
}
function test(){
  load(function(st){
    if(st === "ok"){ MSG = "Connected. The data file was read."; MSGERR = false; }
    else if(st === "empty"){ MSG = "Connected. The file will be created on the first save."; MSGERR = false; }
    else if(st === "auth"){ MSG = "GitHub refused the token."; MSGERR = true; }
    else if(st === "nocfg"){ MSG = "Fill in owner, repo and token first."; MSGERR = true; }
    else { MSG = "Could not reach GitHub."; MSGERR = true; }
    draw();
  });
}

window.WMA = {open:open, close:close, tab:function(k){ TAB = k; draw(); },
  depOk:depOk, depNo:depNo, wdOk:wdOk, wdNo:wdNo,
  accAdd:accAdd, accToggle:accToggle, accDel:accDel,
  teamAdd:teamAdd, teamDel:teamDel, setupSave:setupSave, test:test};

/* The gear appears only in admin mode, so a customer never sees it. The bot's
   /admin button already opens the app with admin=1. */
function gate(){
  var on = false;
  try{
    if(String(location.search||"").indexOf("admin=1") >= 0){ on = true; }
    if(String(location.hash||"").indexOf("admin") >= 0){ on = true; }
  }catch(e){}
  if(!on){ return; }
  var b = document.createElement("button");
  b.textContent = "\u2699";
  b.style.cssText = "position:fixed;right:14px;bottom:78px;z-index:9998;width:46px;height:46px;border-radius:50%;border:1px solid #3b82f6;background:#1d4ed8;color:#fff;font-size:18px;cursor:pointer";
  b.title = "Admin";
  b.onclick = open;
  document.body.appendChild(b);
}
/* ---- balance hand-off from the payment callback ----
   A mini app cannot fetch the bot's balance from a phone: the browser blocks the
   cross-origin call, which is the same reason the catalogue never arrived. So the
   bot puts the new balance in the button link (?bal=12.34) and this writes it into
   the shop's own storage before the page draws. The parameter is then removed, so
   reopening the app does not re-apply an old figure. */
function syncBal(){
  var m = /[?&]bal=([0-9]+(?:\.[0-9]+)?)/.exec(String(location.search||""));
  if(!m){ return; }
  var v = Math.round(Number(m[1])*100)/100;
  if(!isFinite(v)){ return; }
  try{
    localStorage.setItem("wm_balance", JSON.stringify(v));
    var u = null;
    try{ u = JSON.parse(localStorage.getItem("wm_user")||"null"); }catch(e){ u = null; }
    if(u && u.email){
      var all = null;
      try{ all = JSON.parse(localStorage.getItem("wm_accounts")||"null"); }catch(e){ all = null; }
      if(all && all[u.email]){
        all[u.email].balance = v;
        localStorage.setItem("wm_accounts", JSON.stringify(all));
      }
    }
  }catch(e){}
  /* Drop the parameter and redraw once. Without this the app would keep showing
     the old number until it was reopened. */
  try{
    history.replaceState(null, "", location.pathname + location.hash);
    location.reload();
  }catch(e){}
}
syncBal();

if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", gate); }
else { gate(); }
})();
