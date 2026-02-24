// ==UserScript==
// @name        Monopoly Go - Album Extractor
// @namespace   UserScripts
// @match       https://*.monopolygo.com/*
// @grant        GM_xmlhttpRequest
// @connect      zopkkmdbmvypptbumnta.supabase.co
// @version     1.76
// @author      Droopygoon
// @downloadURL https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.76";
    const SB_RPC_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/rpc/sync_player_data";
    const SB_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/players_data";
    const SB_KEY = "sb_publishable_E5_01nYHlSHOuywiICnbTQ_lKk1wN0i";

    let albumData = null;
    let showGolds = true;

    // --- Fonctions d'Identification ---
    function getPlayerNameFromDOM() {
        const nameElem = document.querySelector('[data-testid="user-name"]');
        return nameElem ? nameElem.innerText.trim().toUpperCase().replace(/\s+/g, '_') : "JOUEUR";
    }

    function getOrCreateUserID() {
        let id = localStorage.getItem('mgo_user_id');
        if (!id) {
            const name = getPlayerNameFromDOM();
            const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            id = `${name}-${suffix}`;
            localStorage.setItem('mgo_user_id', id);
        }
        return id;
    }

    function formatDate(dateStr) {
        if (!dateStr) return "Inconnue";
        const d = new Date(dateStr);
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // --- Appels API ---
    async function syncToCloud(data) {
        const userId = getOrCreateUserID();
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: SB_RPC_URL,
                headers: { 
                    "apikey": SB_KEY, 
                    "Authorization": `Bearer ${SB_KEY}`, 
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                data: JSON.stringify({ 
                    p_user_id: userId, 
                    p_missing: data.rawM, 
                    p_doubles: data.rawD 
                }),
                onload: (res) => (res.status >= 200 && res.status < 300) ? resolve(true) : reject(`Erreur ${res.status}`),
                onerror: () => reject("Erreur Réseau")
            });
        });
    }

    async function fetchFriendFromCloud(friendId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${SB_URL}?user_id=eq.${friendId.toUpperCase()}`,
                headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
                onload: (res) => {
                    try { 
                        const result = JSON.parse(res.responseText); 
                        if (result.length > 0) resolve(result[0]);
                        else reject("Introuvable");
                    } catch(e) { reject("Erreur JSON"); }
                },
                onerror: () => reject("Erreur Réseau")
            });
        });
    }

    // --- Interception Réseau (Base 1.67) ---
    const handleData = (json) => { if (json?.Data?.Sets) { albumData = json.Data; createFloatingButton(); } };
    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', () => { if (this.responseURL.includes('sticker-trading')) { try { handleData(JSON.parse(this.responseText)); } catch(e) {} } });
        return rawOpen.apply(this, arguments);
    };
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch(...args).then(response => {
            const url = (typeof args[0] === 'string') ? args[0] : args[0].url;
            if (url?.includes('sticker-trading')) { response.clone().json().then(handleData).catch(() => {}); }
            return response;
        });
    };

    function parseFriendData(text) {
        const result = {}; if(!text) return result;
        text.split('\n').forEach(line => {
            const match = line.match(/^(\d+)-(.*)$/);
            if (match) {
                const setNum = parseInt(match[1]);
                result[setNum] = match[2].split(',').map(id => id.trim().replace('[','').replace(']',''));
            }
        });
        return result;
    }

    function generateContent() {
        let mLines = [], dLines = [], rawM = "", rawD = "";
        albumData.Sets.forEach((set, i) => {
            let mList = [], dList = [], rawMList = [], rawDList = [];
            set.Stickers.forEach(s => {
                let id = s.StickerId.split('.').pop();
                let isGold = [9,10,11].includes(s.Rarity);
                if (s.OwnedCount === 0) {
                    if (!isGold) { mList.push(id); rawMList.push(id); }
                    else if (showGolds) { mList.push(`<span style="color:#d4af37;font-weight:bold;">[${id}]</span>`); rawMList.push(`[${id}]`); }
                } else if (s.OwnedCount > 1 && !isGold) {
                    dList.push(id); rawDList.push(id);
                }
            });
            const badge = `<span style="display:inline-block;width:25px;color:#4287f5;font-weight:bold;">${i+1}-</span>`;
            if (mList.length) { mLines.push(`<div>${badge}${mList.join(',')}</div>`); rawM += `${i+1}-${rawMList.join(',')}\n`; }
            if (dList.length) { dLines.push(`<div>${badge}${dList.join(',')}</div>`); rawD += `${i+1}-${rawDList.join(',')}\n`; }
        });
        return { mCol1: mLines.slice(0, Math.ceil(mLines.length/2)).join(''), mCol2: mLines.slice(Math.ceil(mLines.length/2)).join(''), dCol: dLines.join(''), rawM, rawD };
    }

    function createFloatingButton() {
        if (document.getElementById('btn-album-float')) return;
        const b = document.createElement('button');
        b.id = 'btn-album-float'; b.innerHTML = '🐾 Bilan Album';
        b.setAttribute('style', 'position:fixed;bottom:25px;right:25px;z-index:9999;padding:12px 20px;background:#4287f5;color:white;border-radius:30px;border:none;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(66,135,245,0.4);');
        b.onclick = () => showModal(); 
        document.body.appendChild(b);
    }

    function showModal() {
        const existing = document.getElementById('album-modal-overlay');
        if (existing) existing.remove();
        const data = generateContent();
        const myId = getOrCreateUserID();
        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');

        const friends = JSON.parse(localStorage.getItem('mgo_saved_friends') || "[]");
        let friendsOptions = friends.map(f => `<option value="${f}">${f}</option>`).join('');

        overlay.innerHTML = `
            <div style="width:900px; max-width:95%; max-height:90vh; background:#f8f9fa; border-radius:15px; overflow:hidden; display:flex; flex-direction:column; font-family:sans-serif;">
                <div style="padding:15px 20px; background:#4287f5; color:white; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">🐾 Album Extractor - V${CURRENT_VERSION}</h2>
                    <button id="close-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:5px 12px; border-radius:5px; cursor:pointer;">Fermer</button>
                </div>
                <div style="display:flex; background:#eee; border-bottom:1px solid #ddd;">
                    <button id="tab-view" style="flex:1; padding:12px; border:none; background:#fff; cursor:pointer; font-weight:bold;">Mon Inventaire</button>
                    <button id="tab-compare" style="flex:1; padding:12px; border:none; background:#eee; cursor:pointer; font-weight:bold; border-left:1px solid #ddd;">🤝 Comparer</button>
                </div>

                <div id="content-view" style="display:block; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background:#f0f7ff; padding:10px; border-radius:8px; border:1px solid #bae0ff;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <strong>Mon ID : <span id="display-my-id" style="color:#4287f5; font-size:1rem;">${myId}</span></strong>
                            <button id="copy-my-id" style="background:#4287f5; color:white; border:none; padding:4px 8px; font-size:0.7rem; border-radius:4px; cursor:pointer;">Copier</button>
                            <button id="import-my-id" style="background:#666; color:white; border:none; padding:4px 8px; font-size:0.7rem; border-radius:4px; cursor:pointer;">Importer ID</button>
                        </div>
                        <button id="btn-sync-cloud" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">☁️ Partager mon Album</button>
                    </div>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:10px; font-size:0.85rem;">
                        <input type="checkbox" id="toggle-gold" ${showGolds ? 'checked' : ''}> <label for="toggle-gold">Afficher les Ors [Golds]</label>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #ffebeb; margin-bottom:10px;"><h3 style="color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3></div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;"><div>${data.mCol1}</div><div>${data.mCol2}</div></div>
                        </div>
                        <div style="border-left:1px solid #eee; padding-left:20px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e8f5e9; margin-bottom:10px;"><h3 style="color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3></div>
                            <div style="font-family:monospace; font-size:0.85rem;">${data.dCol}</div>
                        </div>
                    </div>
                </div>

                <div id="content-compare" style="display:none; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px;">
                        <h4 style="margin:0 0 10px 0; color:#4287f5;">1. Charger un ami</h4>
                        <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                            <select id="friend-select" style="padding:10px; border-radius:8px; border:1px solid #ddd; background:white; font-size:0.85rem; flex:1;">
                                <option value="">-- Mes Favoris --</option>
                                ${friendsOptions}
                            </select>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="text" id="friend-id-input" placeholder="ID de l'ami..." style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                            <button id="btn-load-friend" style="padding:10px 20px; background:#4287f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Récupérer</button>
                            <button id="btn-save-friend" style="display:none; padding:10px; background:#f39c12; color:white; border:none; border-radius:8px; cursor:pointer;">⭐</button>
                            <button id="btn-del-friend" style="display:none; padding:10px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer;">🗑️</button>
                        </div>
                        <div id="friend-status" style="margin-top:8px; font-size:0.8rem; color:#666; font-style:italic; min-height:1.2em;"></div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 15px 0; color:#666;">2. Détails & Comparaison</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                            <div>
                                <label style="display:block; font-size:0.75rem; font-weight:bold; color:#e44d26; margin-bottom:5px;">SES MANQUANTES</label>
                                <textarea id="friend-missing" style="width:100%; height:160px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem; resize:none; box-sizing:border-box;"></textarea>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.75rem; font-weight:bold; color:#27ae60; margin-bottom:5px;">SES DOUBLES</label>
                                <textarea id="friend-doubles" style="width:100%; height:160px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem; resize:none; box-sizing:border-box;"></textarea>
                            </div>
                        </div>
                    </div>
                    <div id="compare-results" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:20px; border-top:2px solid #f0f0f0; padding-top:20px;"></div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // Actions ID
        document.getElementById('copy-my-id').onclick = () => { navigator.clipboard.writeText(myId); alert("ID Copié !"); };
        document.getElementById('import-my-id').onclick = () => {
            const n = prompt("Entre l'ID à importer (ex: EMMANUEL-XXXX) :", myId);
            if(n) { localStorage.setItem('mgo_user_id', n.toUpperCase()); showModal(); }
        };

        // Gestion Favoris
        const fSelect = document.getElementById('friend-select'), fInput = document.getElementById('friend-id-input'), fStatus = document.getElementById('friend-status'), btnSave = document.getElementById('btn-save-friend'), btnDel = document.getElementById('btn-del-friend');
        
        fSelect.onchange = () => { 
            if (fSelect.value) { 
                fInput.value = fSelect.value; 
                btnDel.style.display = 'block'; 
                btnSave.style.display = 'none'; 
            } else { btnDel.style.display = 'none'; } 
        };
        
        btnSave.onclick = () => { 
            let list = JSON.parse(localStorage.getItem('mgo_saved_friends') || "[]"); 
            if (!list.includes(fInput.value.toUpperCase())) { 
                list.push(fInput.value.toUpperCase()); 
                localStorage.setItem('mgo_saved_friends', JSON.stringify(list)); 
                showModal(); document.getElementById('tab-compare').click(); 
            } 
        };
        
        btnDel.onclick = () => { 
            if(confirm("Supprimer cet ami ?")) { 
                let list = JSON.parse(localStorage.getItem('mgo_saved_friends') || "[]").filter(f => f !== fSelect.value); 
                localStorage.setItem('mgo_saved_friends', JSON.stringify(list)); 
                showModal(); document.getElementById('tab-compare').click(); 
            } 
        };

        // Sync & Navigation
        document.getElementById('btn-sync-cloud').onclick = async (e) => {
            const btn = e.target; btn.innerHTML = "⌛ Synchro..."; btn.disabled = true;
            try { await syncToCloud(data); btn.innerHTML = "✅ Partagé !"; btn.style.background = "#27ae60"; } 
            catch (err) { btn.innerHTML = "❌ " + err; btn.style.background = "#e44d26"; }
            setTimeout(() => { btn.innerHTML = "☁️ Partager mon Album"; btn.disabled = false; btn.style.background = "#27ae60"; }, 3000);
        };

        const vTab = document.getElementById('tab-view'), cTab = document.getElementById('tab-compare'), vContent = document.getElementById('content-view'), cContent = document.getElementById('content-compare');
        vTab.onclick = () => { vTab.style.background = "#fff"; cTab.style.background = "#eee"; vContent.style.display = "block"; cContent.style.display = "none"; };
        cTab.onclick = () => { cTab.style.background = "#fff"; vTab.style.background = "#eee"; cContent.style.display = "block"; vContent.style.display = "none"; };
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('toggle-gold').onchange = (e) => { showGolds = e.target.checked; showModal(); };

        // Logique Comparaison
        document.getElementById('btn-load-friend').onclick = async () => {
            const fId = fInput.value.trim(); if (!fId) return;
            const btn = document.getElementById('btn-load-friend'); btn.innerHTML = "⌛..."; fStatus.innerHTML = "";
            try {
                const fData = await fetchFriendFromCloud(fId);
                if (fData) {
                    document.getElementById('friend-missing').value = fData.missing_text;
                    document.getElementById('friend-doubles').value = fData.doubles_text;
                    fStatus.innerHTML = `📅 Mise à jour : <b>${formatDate(fData.updated_at)}</b>`;
                    
                    const fM = parseFriendData(fData.missing_text), fD = parseFriendData(fData.doubles_text);
                    const resDiv = document.getElementById('compare-results');
                    let canGet = "", canGive = "";
                    
                    albumData.Sets.forEach((set, i) => {
                        let sN = i + 1, gL = [], vL = [];
                        set.Stickers.forEach(s => {
                            let id = s.StickerId.split('.').pop();
                            if ([9,10,11].includes(s.Rarity)) return;
                            if (s.OwnedCount === 0 && fD[sN]?.includes(id)) gL.push(id);
                            if (s.OwnedCount > 1 && fM[sN]?.includes(id)) vL.push(id);
                        });
                        if (gL.length) canGet += `<div><span style="font-weight:bold; color:#4287f5;">${sN}-</span>${gL.join(',')}</div>`;
                        if (vL.length) canGive += `<div><span style="font-weight:bold; color:#4287f5;">${sN}-</span>${vL.join(',')}</div>`;
                    });
                    
                    resDiv.innerHTML = `<div style="background:#e8f5e9; padding:15px; border-radius:10px; border:1px solid #c8e6c9;"><h4 style="margin:0 0 10px 0; color:#2e7d32;">🎁 Reçevables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGet || "Aucun"}</div></div><div style="background:#fff3e0; padding:15px; border-radius:10px; border:1px solid #ef6c00;"><h4 style="margin:0 0 10px 0; color:#ef6c00;">🤝 Donnables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGive || "Aucun"}</div></div>`;
                    btn.innerHTML = "✅";
                    
                    if (!JSON.parse(localStorage.getItem('mgo_saved_friends') || "[]").includes(fId.toUpperCase())) btnSave.style.display = 'block';
                }
            } catch (err) { alert("ID introuvable"); btn.innerHTML = "Récupérer"; }
        };
    }
})();
