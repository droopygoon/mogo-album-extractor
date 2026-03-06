// ==UserScript==
// @name         Monopoly Go - Album Extractor
// @namespace    UserScripts
// @match         https://*.monopolygo.com/*
// @grant         GM_xmlhttpRequest
// @connect       zopkkmdbmvypptbumnta.supabase.co
// @version      1.86
// @author        Droopygoon & Emmanuel
// @downloadURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL     https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.86";
    const SB_RPC_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/rpc/sync_player_data";
    const SB_URL = "https://zopkkmdbmvypptbumnta.supabase.co/rest/v1/players_data";
    const SB_KEY = "sb_publishable_E5_01nYHlSHOuywiICnbTQ_lKk1wN0i";

    let albumData = null;
    let showGolds = true;

    // --- RESTAURATION : Notification de mise à jour ---
    function checkUpdateNotification() {
        const lastVersion = localStorage.getItem('mgo_extractor_version');
        if (lastVersion && lastVersion !== CURRENT_VERSION) {
            showUpdateToast(`🚀 v${CURRENT_VERSION} : Synchro Cloud des favoris & Correctifs activés !`);
        }
        localStorage.setItem('mgo_extractor_version', CURRENT_VERSION);
    }

    function showUpdateToast(msg) {
        const t = document.createElement('div');
        t.setAttribute('style', 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:12px 25px;border-radius:50px;z-index:10001;font-family:sans-serif;font-weight:bold;box-shadow:0 4px 15px rgba(0,0,0,0.2);transition:opacity 0.5s;');
        t.innerHTML = msg; document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
    }

    if (document.readyState === 'complete') checkUpdateNotification();
    else window.addEventListener('load', checkUpdateNotification);

    // --- Fonctions Utilitaires ---
    function getPlayerNameFromDOM() {
        const nameElem = document.querySelector('[data-testid="user-name"]') || document.querySelector('.user-name') || document.querySelector('div[class*="NameContainer"]');
        let name = nameElem ? nameElem.innerText.trim().toUpperCase().replace(/\s+/g, '_') : "";
        return name || "JOUEUR";
    }

    function getOrCreateUserID() {
        let id = localStorage.getItem('mgo_user_id');
        if (!id || !id.includes('-') || id.length < 8) {
            const name = getPlayerNameFromDOM();
            const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            id = `${name}-${suffix}`;
            localStorage.setItem('mgo_user_id', id);
        }
        return id;
    }

    function getLocalFavs() { return JSON.parse(localStorage.getItem('mgo_saved_friends') || "[]"); }
    function setLocalFavs(arr) { localStorage.setItem('mgo_saved_friends', JSON.stringify([...new Set(arr)])); }

    function formatDate(dateStr) {
        if (!dateStr) return "Inconnue";
        const d = new Date(dateStr);
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // --- Communications Cloud ---
    async function syncToCloud(fullData = null) {
        const userId = getOrCreateUserID();
        const favs = getLocalFavs();
        const data = fullData || generateContent();
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: SB_RPC_URL,
                headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
                data: JSON.stringify({ 
                    p_user_id: userId, 
                    p_missing: data.rawM, 
                    p_doubles: data.rawD, 
                    p_friends: favs 
                }),
                onload: (res) => (res.status >= 200 && res.status < 300) ? resolve(true) : reject(),
                onerror: () => reject()
            });
        });
    }

    async function fetchPlayerData(targetId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${SB_URL}?user_id=eq.${targetId.toUpperCase()}`,
                headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if (result.length > 0) resolve(result[0]);
                        else reject("Introuvable");
                    } catch(e) { reject(); }
                },
                onerror: () => reject()
            });
        });
    }

    // --- Logique Album ---
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
        if (!albumData) return { rawM: "", rawD: "" };
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
        return { 
            mCol1: mLines.slice(0, Math.ceil(mLines.length/2)).join(''), 
            mCol2: mLines.slice(Math.ceil(mLines.length/2)).join(''), 
            dCol: dLines.join(''), 
            rawM, rawD 
        };
    }

    function createFloatingButton() {
        if (document.getElementById('btn-album-float')) return;
        const b = document.createElement('button');
        b.id = 'btn-album-float'; b.innerHTML = '🐾 Bilan Album';
        b.setAttribute('style', 'position:fixed;bottom:25px;right:25px;z-index:9999;padding:12px 20px;background:#4287f5;color:white;border-radius:30px;border:none;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(66,135,245,0.4);');
        b.onclick = showModal; document.body.appendChild(b);
    }

    async function showModal() {
        const existing = document.getElementById('album-modal-overlay');
        if (existing) existing.remove();
        
        const data = generateContent();
        const myId = getOrCreateUserID();

        // Synchro descendante silencieuse
        fetchPlayerData(myId).then(remote => {
            if (remote?.friends_list) {
                const merged = [...new Set([...getLocalFavs(), ...remote.friends_list])];
                setLocalFavs(merged);
            }
        }).catch(() => {});

        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');

        const friendsOptions = getLocalFavs().map(f => `<option value="${f}">${f}</option>`).join('');

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
                            <strong>ID : <span id="display-my-id" style="color:#4287f5; font-size:1.1rem;">${myId}</span></strong>
                            <button id="import-my-id" style="background:#666; color:white; border:none; padding:4px 8px; font-size:0.7rem; border-radius:4px; cursor:pointer;">Importer ID</button>
                        </div>
                        <button id="btn-sync-cloud" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">☁️ Partager mon Album</button>
                    </div>
                    <div style="margin-bottom:10px; font-size:0.9rem;">
                         <input type="checkbox" id="toggle-gold" ${showGolds ? 'checked' : ''}> <label for="toggle-gold">Afficher les Ors [Golds]</label>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #ffebeb; margin-bottom:10px;"><h3 style="color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3><button id="copy-m" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button></div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;"><div>${data.mCol1}</div><div>${data.mCol2}</div></div>
                        </div>
                        <div style="border-left:1px solid #eee; padding-left:20px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e8f5e9; margin-bottom:10px;"><h3 style="color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3><button id="copy-d" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button></div>
                            <div style="font-family:monospace; font-size:0.85rem;">${data.dCol}</div>
                        </div>
                    </div>
                </div>

                <div id="content-compare" style="display:none; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px;">
                        <h4 style="margin:0 0 10px 0; color:#4287f5;">1. Charger un ami</h4>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <select id="friend-select" style="width:180px; padding:10px; border-radius:8px; border:1px solid #ddd; background:white;">
                                <option value="">-- Favoris --</option>
                                ${friendsOptions}
                            </select>
                            <input type="text" id="friend-id-input" placeholder="ID de l'ami..." style="flex:1; padding:10px; border-radius:8px; border:1px solid #ddd;">
                            <button id="btn-load-friend" style="padding:10px 20px; background:#4287f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Récupérer</button>
                            <button id="btn-save-friend" style="display:none; padding:10px; background:#f39c12; color:white; border:none; border-radius:8px; cursor:pointer; width:44px;">⭐</button>
                            <button id="btn-del-friend" style="display:none; padding:10px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer; width:44px;">🗑️</button>
                        </div>
                        <div id="friend-status" style="margin-top:8px; font-size:0.85rem; color:#666;"></div>
                    </div>
                    <div id="compare-results" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;"></div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const fInput = document.getElementById('friend-id-input');
        const fSelect = document.getElementById('friend-select');
        const btnSave = document.getElementById('btn-save-friend');
        const btnDel = document.getElementById('btn-del-friend');
        const fStatus = document.getElementById('friend-status');

        const updateFavButtons = (id) => {
            const favs = getLocalFavs();
            const upperID = id.trim().toUpperCase();
            if (!upperID) { btnSave.style.display = 'none'; btnDel.style.display = 'none'; return; }
            if (favs.includes(upperID)) {
                btnSave.style.display = 'none'; btnDel.style.display = 'block';
            } else {
                btnSave.style.display = 'block'; btnDel.style.display = 'none';
            }
        };

        // --- EVENTS ---
        btnSave.onclick = async () => {
            const id = fInput.value.trim().toUpperCase();
            if (!id) return;
            let favs = getLocalFavs();
            favs.push(id);
            setLocalFavs(favs);
            try {
                await syncToCloud();
                const opt = document.createElement('option'); opt.value = id; opt.text = id;
                fSelect.add(opt); fSelect.value = id;
                updateFavButtons(id);
            } catch(e) { alert("Erreur synchro Cloud"); }
        };

        btnDel.onclick = async () => {
            const id = fInput.value.trim().toUpperCase();
            if (!id || !confirm(`Supprimer ${id} ?`)) return;
            let favs = getLocalFavs().filter(f => f !== id);
            setLocalFavs(favs);
            try {
                await syncToCloud();
                for (let i=0; i<fSelect.options.length; i++) {
                    if (fSelect.options[i].value === id) { fSelect.remove(i); break; }
                }
                fInput.value = "";
                updateFavButtons("");
            } catch(e) { alert("Erreur synchro Cloud"); }
        };

        document.getElementById('btn-load-friend').onclick = async () => {
            const id = fInput.value.trim(); if (!id) return;
            const btn = document.getElementById('btn-load-friend');
            btn.innerHTML = "⌛...";
            try {
                const friendData = await fetchPlayerData(id);
                fStatus.innerHTML = `📅 Mise à jour : <b>${formatDate(friendData.updated_at)}</b>`;
                const fMissing = parseFriendData(friendData.missing_text);
                const fDoubles = parseFriendData(friendData.doubles_text);
                let canGet = "", canGive = "";
                albumData.Sets.forEach((set, i) => {
                    let setNum = i + 1, getL = [], giveL = [];
                    set.Stickers.forEach(s => {
                        let sid = s.StickerId.split('.').pop();
                        if ([9,10,11].includes(s.Rarity)) return;
                        if (s.OwnedCount === 0 && fDoubles[setNum]?.includes(sid)) getL.push(sid);
                        if (s.OwnedCount > 1 && fMissing[setNum]?.includes(sid)) giveL.push(sid);
                    });
                    if (getL.length) canGet += `<div><b>${setNum}-</b>${getL.join(',')}</div>`;
                    if (giveL.length) canGive += `<div><b>${setNum}-</b>${giveL.join(',')}</div>`;
                });
                document.getElementById('compare-results').innerHTML = `
                    <div style="background:#e8f5e9; padding:10px; border-radius:8px;"><b>🎁 Reçevables :</b><br>${canGet || "Aucun"}</div>
                    <div style="background:#fff3e0; padding:10px; border-radius:8px;"><b>🤝 Donnables :</b><br>${canGive || "Aucun"}</div>`;
                btn.innerHTML = "Récupérer";
            } catch(e) { alert("ID non trouvé."); btn.innerHTML = "Récupérer"; }
        };

        // UI Tabs & Toggles
        document.getElementById('toggle-gold').onchange = (e) => { showGolds = e.target.checked; showModal(); };
        fSelect.onchange = () => { fInput.value = fSelect.value; updateFavButtons(fSelect.value); };
        fInput.oninput = () => updateFavButtons(fInput.value);
        document.getElementById('tab-view').onclick = () => { 
            document.getElementById('content-view').style.display = "block"; 
            document.getElementById('content-compare').style.display = "none";
            document.getElementById('tab-view').style.background = "#fff";
            document.getElementById('tab-compare').style.background = "#eee";
        };
        document.getElementById('tab-compare').onclick = () => { 
            document.getElementById('content-compare').style.display = "block"; 
            document.getElementById('content-view').style.display = "none";
            document.getElementById('tab-compare').style.background = "#fff";
            document.getElementById('tab-view').style.background = "#eee";
        };
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('copy-m').onclick = () => navigator.clipboard.writeText("❌ MANQUANTES :\n" + data.rawM);
        document.getElementById('copy-d').onclick = () => navigator.clipboard.writeText("✅ DOUBLES :\n" + data.rawD);
        document.getElementById('import-my-id').onclick = () => {
            const n = prompt("Nouvel ID :", myId);
            if(n) { localStorage.setItem('mgo_user_id', n.trim().toUpperCase()); showModal(); }
        };
        document.getElementById('btn-sync-cloud').onclick = async (e) => {
            const btn = e.target; btn.innerHTML = "⌛ Synchro..."; btn.disabled = true;
            try {
                await syncToCloud(data);
                btn.innerHTML = "✅ Synchro OK !"; btn.style.background = "#27ae60";
            } catch (err) { btn.innerHTML = "❌ Erreur"; btn.style.background = "#e44d26"; }
            setTimeout(() => { btn.innerHTML = "☁️ Partager mon Album"; btn.disabled = false; btn.style.background = "#27ae60"; }, 2000);
        };
    }

    // --- Interception ---
    const handleData = (json) => { if (json?.Data?.Sets) { albumData = json.Data; createFloatingButton(); } };
    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', () => { if (this.responseURL.includes('sticker-trading')) { try { handleData(JSON.parse(this.responseText)); } catch(e) {} } });
        return rawOpen.apply(this, arguments);
    };
})();
