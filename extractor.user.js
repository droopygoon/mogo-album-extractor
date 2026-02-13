// ==UserScript==
// @name        Monopoly Go - Album Extractor
// @namespace   UserScripts
// @match       https://*.monopolygo.com/*
// @grant       none
// @version     1.63
// @author      Droopygoon
// @downloadURL https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.63";
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

    // --- Interception ---
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

    // --- Parsing du texte pour comparaison ---
    function parseFriendData(text) {
        const result = {};
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

    // --- Logique de rendu ---
    function generateContent() {
        let mLines = [], dLines = [], rawM = "❌ MES MANQUANTES :\n", rawD = "✅ MES DOUBLES :\n";
        albumData.Sets.forEach((set, i) => {
            let mList = [], dList = [], rawMList = [];
            set.Stickers.forEach(s => {
                let id = s.StickerId.split('.').pop();
                let isGold = [9,10,11].includes(s.Rarity);
                if (s.OwnedCount === 0) {
                    if (!isGold) { mList.push(id); rawMList.push(id); }
                    else if (showGolds) { mList.push(`<span style="color:#d4af37;font-weight:bold;">[${id}]</span>`); rawMList.push(`[${id}]`); }
                } else if (s.OwnedCount > 1 && !isGold) { dList.push(id); }
            });
            const badge = `<span style="display:inline-block;width:25px;color:#4287f5;font-weight:bold;">${i+1}-</span>`;
            if (mList.length) { mLines.push(`<div>${badge}${mList.join(',')}</div>`); rawM += `${i+1}-${rawMList.join(',')}\n`; }
            if (dList.length) { dLines.push(`<div>${badge}${dList.join(',')}</div>`); rawD += `${i+1}-${dList.join(',')}\n`; }
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
        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');

        overlay.innerHTML = `
            <div style="width:900px; max-width:95%; max-height:90vh; background:#f8f9fa; border-radius:15px; overflow:hidden; display:flex; flex-direction:column; font-family:sans-serif;">
                <div style="padding:15px 20px; background:#4287f5; color:white; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">🐾 Mon Album Monopoly Go - @2026 Droopygoon - V${CURRENT_VERSION}</h2>
                    <button id="close-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:5px 12px; border-radius:5px; cursor:pointer;">Fermer</button>
                </div>
                <div style="display:flex; background:#eee; border-bottom:1px solid #ddd;">
                    <button id="tab-view" style="flex:1; padding:12px; border:none; background:#fff; cursor:pointer; font-weight:bold;">Mon Inventaire</button>
                    <button id="tab-compare" style="flex:1; padding:12px; border:none; background:#eee; cursor:pointer; font-weight:bold; border-left:1px solid #ddd;">🤝 Comparer avec un ami</button>
                </div>

                <div id="content-view" style="display:block; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:10px; font-size:0.85rem;">
                        <input type="checkbox" id="toggle-gold" ${showGolds ? 'checked' : ''}> <label for="toggle-gold">Afficher les Ors [Golds]</label>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #ffebeb; margin-bottom:10px;">
                                <h3 style="color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3>
                                <button id="copy-m" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer; margin-bottom:5px;">Copier</button>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;">
                                <div>${data.mCol1}</div><div>${data.mCol2}</div>
                            </div>
                        </div>
                        <div style="border-left:1px solid #eee; padding-left:20px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e8f5e9; margin-bottom:10px;">
                                <h3 style="color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3>
                                <button id="copy-d" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer; margin-bottom:5px;">Copier</button>
                            </div>
                            <div style="font-family:monospace; font-size:0.85rem;">${data.dCol}</div>
                        </div>
                    </div>
                </div>

                <div id="content-compare" style="display:none; padding:20px; overflow-y:auto; background:#fff;">
                    <p style="font-size:0.9rem; color:#666;">Collez ici les listes de votre ami pour trouver les échanges possibles :</p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                        <textarea id="friend-missing" placeholder="Collez ses MANQUANTES ici..." style="height:100px; padding:10px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.8rem;"></textarea>
                        <textarea id="friend-doubles" placeholder="Collez ses DOUBLES ici..." style="height:100px; padding:10px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.8rem;"></textarea>
                    </div>
                    <button id="run-compare" style="width:100%; padding:10px; background:#4287f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Lancer la comparaison</button>
                    <div id="compare-results" style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:20px;"></div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // --- Evenements Onglets ---
        const vTab = document.getElementById('tab-view');
        const cTab = document.getElementById('tab-compare');
        const vContent = document.getElementById('content-view');
        const cContent = document.getElementById('content-compare');

        vTab.onclick = () => { vTab.style.background = "#fff"; cTab.style.background = "#eee"; vContent.style.display = "block"; cContent.style.display = "none"; };
        cTab.onclick = () => { cTab.style.background = "#fff"; vTab.style.background = "#eee"; cContent.style.display = "block"; vContent.style.display = "none"; };

        // --- Actions ---
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('toggle-gold').onchange = (e) => { showGolds = e.target.checked; showModal(); };

        const copyToClip = (text, btn) => {
            navigator.clipboard.writeText(text).then(() => {
                const old = btn.innerHTML; btn.innerHTML = "✅ Copié !"; btn.style.background = "#27ae60";
                setTimeout(() => { btn.innerHTML = old; btn.style.background = "#666"; }, 2000);
            });
        };
        document.getElementById('copy-m').onclick = (e) => copyToClip(data.rawM, e.target);
        document.getElementById('copy-d').onclick = (e) => copyToClip(data.rawD, e.target);

        // --- Logique de Comparaison ---
        document.getElementById('run-compare').onclick = () => {
            const fMissing = parseFriendData(document.getElementById('friend-missing').value);
            const fDoubles = parseFriendData(document.getElementById('friend-doubles').value);
            const resultsDiv = document.getElementById('compare-results');

            let canGet = "", canGive = "";

            albumData.Sets.forEach((set, i) => {
                let setNum = i + 1;
                let getList = [], giveList = [];

                set.Stickers.forEach(s => {
                    let id = s.StickerId.split('.').pop();
                    let isGold = [9,10,11].includes(s.Rarity);
                    if (isGold) return; // Pas d'échange d'or en dehors des events

                    // 1. Ce qu'il peut me donner (Mes manquantes VS Ses doubles)
                    if (s.OwnedCount === 0 && fDoubles[setNum]?.includes(id)) getList.push(id);
                    // 2. Ce que je peux lui donner (Mes doubles VS Ses manquantes)
                    if (s.OwnedCount > 1 && fMissing[setNum]?.includes(id)) giveList.push(id);
                });

                const badge = `<span style="font-weight:bold; color:#4287f5;">${setNum}-</span>`;
                if (getList.length) canGet += `<div>${badge}${getList.join(',')}</div>`;
                if (giveList.length) canGive += `<div>${badge}${giveList.join(',')}</div>`;
            });

            resultsDiv.innerHTML = `
                <div style="background:#e8f5e9; padding:15px; border-radius:10px; border:1px solid #c8e6c9;">
                    <h4 style="margin:0 0 10px 0; color:#2e7d32;">🎁 Tu peux recevoir :</h4>
                    <div style="font-family:monospace; font-size:0.85rem;">${canGet || "Aucun match trouvé"}</div>
                </div>
                <div style="background:#fff3e0; padding:15px; border-radius:10px; border:1px solid #ffe0b2;">
                    <h4 style="margin:0 0 10px 0; color:#ef6c00;">🤝 Tu peux donner :</h4>
                    <div style="font-family:monospace; font-size:0.85rem;">${canGive || "Aucun match trouvé"}</div>
                </div>`;
        };
    }
