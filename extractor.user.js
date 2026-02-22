// ==UserScript==
// @name        Monopoly Go - Album Extractor
// @namespace   UserScripts
// @match       https://*.monopolygo.com/*
// @grant        GM_xmlhttpRequest
// @connect      zopkkmdbmvypptbumnta.supabase.co
// @version     1.65
// @author      Droopygoon
// @downloadURL https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.65";
    const SB_RPC_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/rpc/sync_player_data";
    const SB_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/players_data";
    const SB_KEY = "sb_publishable_E5_01nYHlSHOuywiICnbTQ_lKk1wN0i";

    let albumData = null;
    let showGolds = true;
// --- Gestion Notification ---
    function checkUpdateNotification() {
        const lastVersion = localStorage.getItem('mgo_extractor_version');
        if (lastVersion && lastVersion !== CURRENT_VERSION) {
            showUpdateToast(`🚀 Mise à jour v${CURRENT_VERSION} : Mode Comparaison ajouté !`);
        }
        localStorage.setItem('mgo_extractor_version', CURRENT_VERSION);
    }

    function showUpdateToast(msg) {
        const t = document.createElement('div');
        t.setAttribute('style', 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:12px 25px;border-radius:50px;z-index:10001;font-family:sans-serif;font-weight:bold;box-shadow:0 4px 15px rgba(0,0,0,0.2);transition:opacity 0.5s;');
        t.innerHTML = msg; document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
    }

    checkUpdateNotification();
    function getOrCreateUserID() {
        let id = localStorage.getItem('mgo_user_id');
        if (!id) {
            id = Math.random().toString(36).substring(2, 8).toUpperCase();
            localStorage.setItem('mgo_user_id', id);
        }
        return id;
    }

    async function syncToCloud(data) {
        const userId = getOrCreateUserID();
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: SB_RPC_URL,
                headers: {
                    "apikey": SB_KEY,
                    "Authorization": `Bearer ${SB_KEY}`,
                    "Content-Type": "application/json"
                },
                data: JSON.stringify({
                    p_user_id: userId,
                    p_missing: data.rawM,
                    p_doubles: data.rawD
                }),
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) resolve(true);
                    else reject(`Erreur RPC ${res.status}`);
                },
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
                        resolve(result[0]);
                    } catch(e) { reject("Données invalides"); }
                },
                onerror: () => reject("ID introuvable")
            });
        });
    }

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
        const result = {};
        if(!text) return result;
        const lines = text.split('\n');
        lines.forEach(line => {
            const match = line.match(/^(\d+)-(.*)$/);
            if (match) {
                const setNum = parseInt(match[1]);
                const ids = match[2].split(',').map(id => id.trim().replace('[','').replace(']',''));
                result[setNum] = ids;
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
                    dList.push(id);
                    rawDList.push(id);
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
        b.onclick = showModal; document.body.appendChild(b);
    }

    function showModal() {
        const existing = document.getElementById('album-modal-overlay');
        if (existing) existing.remove();
        const data = generateContent();
        const myId = getOrCreateUserID();
        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');

        overlay.innerHTML = `
            <div style="width:900px; max-width:95%; max-height:90vh; background:#f8f9fa; border-radius:15px; overflow:hidden; display:flex; flex-direction:column; font-family:sans-serif;">
                <div style="padding:15px 20px; background:#4287f5; color:white; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">🐾 Mon Album Monopoly Go - V${CURRENT_VERSION}</h2>
                    <button id="close-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:5px 12px; border-radius:5px; cursor:pointer;">Fermer</button>
                </div>
                <div style="display:flex; background:#eee; border-bottom:1px solid #ddd;">
                    <button id="tab-view" style="flex:1; padding:12px; border:none; background:#fff; cursor:pointer; font-weight:bold;">Mon Inventaire</button>
                    <button id="tab-compare" style="flex:1; padding:12px; border:none; background:#eee; cursor:pointer; font-weight:bold; border-left:1px solid #ddd;">🤝 Comparer</button>
                </div>

                <div id="content-view" style="display:block; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background:#f0f7ff; padding:10px; border-radius:8px; border:1px solid #bae0ff;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <strong>ID : <span id="display-my-id" style="color:#4287f5; font-size:1.1rem; cursor:pointer;">${myId}</span></strong>
                            <button id="copy-my-id" style="background:#4287f5; color:white; border:none; padding:4px 8px; font-size:0.7rem; border-radius:4px; cursor:pointer;">Copier ID</button>
                        </div>
                        <button id="btn-sync-cloud" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">☁️ Partager mon Album</button>
                    </div>
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:10px; font-size:0.85rem;">
                        <input type="checkbox" id="toggle-gold" ${showGolds ? 'checked' : ''}> <label for="toggle-gold">Afficher les Ors [Golds]</label>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #ffebeb; margin-bottom:10px;">
                                <h3 style="color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3>
                                <button id="copy-m" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;">
                                <div>${data.mCol1}</div><div>${data.mCol2}</div>
                            </div>
                        </div>
                        <div style="border-left:1px solid #eee; padding-left:20px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e8f5e9; margin-bottom:10px;">
                                <h3 style="color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3>
                                <button id="copy-d" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button>
                            </div>
                            <div style="font-family:monospace; font-size:0.85rem;">${data.dCol}</div>
                        </div>
                    </div>
                </div>

                <div id="content-compare" style="display:none; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:20px;">
                        <h4 style="margin:0 0 10px 0; color:#4287f5;">Option 1 : Via ID Joueur (Cloud)</h4>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="friend-id-input" placeholder="ID de l'ami..." style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                            <button id="btn-load-friend" style="padding:10px 20px; background:#4287f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Récupérer</button>
                        </div>
                    </div>
                    <div style="margin-bottom:20px;">
                        <h4 style="margin:0 0 10px 0; color:#666;">Option 2 : Via Copier/Coller</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                            <textarea id="friend-missing" placeholder="Ses MANQUANTES..." style="height:60px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem;"></textarea>
                            <textarea id="friend-doubles" placeholder="Ses DOUBLES..." style="height:60px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem;"></textarea>
                        </div>
                        <button id="run-manual-compare" style="width:100%; padding:8px; background:#eee; border:1px solid #ccc; border-radius:8px; cursor:pointer; font-weight:bold;">Comparer manuellement</button>
                    </div>
                    <div id="compare-results" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; border-top:2px solid #f0f0f0; padding-top:20px;"></div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const copyToClip = (text, btn, successMsg = "✅") => {
            navigator.clipboard.writeText(text).then(() => {
                const old = btn.innerHTML; btn.innerHTML = successMsg;
                if(btn.id !== "btn-sync-cloud") btn.style.background = "#27ae60";
                setTimeout(() => {
                    btn.innerHTML = old;
                    if(btn.id !== "btn-sync-cloud") btn.style.background = (btn.id === "copy-my-id" || btn.id === "btn-load-friend") ? "#4287f5" : "#666";
                }, 2000);
            });
        };

        document.getElementById('copy-my-id').onclick = (e) => copyToClip(myId, e.target, "Copié !");
        document.getElementById('display-my-id').onclick = () => {
            navigator.clipboard.writeText(myId);
            alert("ID " + myId + " copié !");
        };

        document.getElementById('btn-sync-cloud').onclick = async (e) => {
            const btn = e.target;
            btn.innerHTML = "⌛ Synchro..."; btn.disabled = true;
            try {
                await syncToCloud(data);
                navigator.clipboard.writeText(myId);
                btn.innerHTML = "✅ Synchro & ID Copié !";
                btn.style.background = "#27ae60";
            } catch (err) { btn.innerHTML = "❌ Erreur"; btn.style.background = "#e44d26"; }
            setTimeout(() => { btn.innerHTML = "☁️ Partager mon Album"; btn.disabled = false; btn.style.background = "#27ae60"; }, 3000);
        };

        const vTab = document.getElementById('tab-view');
        const cTab = document.getElementById('tab-compare');
        const vContent = document.getElementById('content-view');
        const cContent = document.getElementById('content-compare');
        vTab.onclick = () => { vTab.style.background = "#fff"; cTab.style.background = "#eee"; vContent.style.display = "block"; cContent.style.display = "none"; };
        cTab.onclick = () => { cTab.style.background = "#fff"; vTab.style.background = "#eee"; cContent.style.display = "block"; vContent.style.display = "none"; };
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('toggle-gold').onchange = (e) => { showGolds = e.target.checked; showModal(); };

        const runCompareLogic = (fMissingRaw, fDoublesRaw) => {
            const fMissing = parseFriendData(fMissingRaw);
            const fDoubles = parseFriendData(fDoublesRaw);
            const resultsDiv = document.getElementById('compare-results');
            let canGet = "", canGive = "";
            albumData.Sets.forEach((set, i) => {
                let setNum = i + 1;
                let getList = [], giveList = [];
                set.Stickers.forEach(s => {
                    let id = s.StickerId.split('.').pop();
                    if ([9,10,11].includes(s.Rarity)) return;
                    if (s.OwnedCount === 0 && fDoubles[setNum]?.includes(id)) getList.push(id);
                    if (s.OwnedCount > 1 && fMissing[setNum]?.includes(id)) giveList.push(id);
                });
                const badge = `<span style="font-weight:bold; color:#4287f5;">${setNum}-</span>`;
                if (getList.length) canGet += `<div>${badge}${getList.join(',')}</div>`;
                if (giveList.length) canGive += `<div>${badge}${giveList.join(',')}</div>`;
            });
            resultsDiv.innerHTML = `
                <div style="background:#e8f5e9; padding:15px; border-radius:10px; border:1px solid #c8e6c9;"><h4 style="margin:0 0 10px 0; color:#2e7d32;">🎁 Reçevables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGet || "Aucun"}</div></div>
                <div style="background:#fff3e0; padding:15px; border-radius:10px; border:1px solid #ffe0b2;"><h4 style="margin:0 0 10px 0; color:#ef6c00;">🤝 Donnables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGive || "Aucun"}</div></div>`;
        };

        document.getElementById('btn-load-friend').onclick = async () => {
            const fId = document.getElementById('friend-id-input').value.trim();
            if (!fId) return alert("Entrez un ID");
            const btn = document.getElementById('btn-load-friend');
            btn.innerHTML = "⌛...";
            try {
                const friendData = await fetchFriendFromCloud(fId);
                if (friendData) { runCompareLogic(friendData.missing_text, friendData.doubles_text); btn.innerHTML = "✅"; }
                else { throw "ID inconnu"; }
            } catch (err) { alert(err); btn.innerHTML = "Récupérer"; }
        };

        document.getElementById('run-manual-compare').onclick = () => {
            runCompareLogic(document.getElementById('friend-missing').value, document.getElementById('friend-doubles').value);
        };

        document.getElementById('copy-m').onclick = (e) => copyToClip(data.rawM, e.target);
        document.getElementById('copy-d').onclick = (e) => copyToClip(data.rawD, e.target);
    }
})();
