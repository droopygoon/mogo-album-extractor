// ==UserScript==
// @name        Monopoly Go - Album Extractor
// @namespace   UserScripts
// @match       https://*.monopolygo.com/*
// @grant       none
// @version     1.61
// @run-at      document-start
// @author      Droopygoon with Gemini
// @downloadURL https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.61"; // Pense à changer ça ici et dans le header à chaque fois
    let albumData = null;
    let showGolds = true;

    // --- Gestion de la notification de mise à jour ---
    function checkUpdateNotification() {
        const lastVersion = localStorage.getItem('mgo_extractor_version');
        if (lastVersion && lastVersion !== CURRENT_VERSION) {
            showUpdateToast(`🚀 Mise à jour installée : v${CURRENT_VERSION}`);
        }
        localStorage.setItem('mgo_extractor_version', CURRENT_VERSION);
    }

    function showUpdateToast(message) {
        const toast = document.createElement('div');
        toast.setAttribute('style', `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #27ae60; color: white; padding: 12px 25px; border-radius: 50px;
            z-index: 10001; font-family: sans-serif; font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: opacity 0.5s;
        `);
        toast.innerHTML = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    // --- Lancement du check ---
    checkUpdateNotification();

    // --- Interception des données (Version Passive/Stable) ---
    const handleData = (json) => {
        if (json?.Data?.Sets) {
            albumData = json.Data;
            createFloatingButton();
        }
    };

    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', () => {
            if (this.responseURL.includes('sticker-trading')) {
                                try {
                    const json = JSON.parse(this.responseText);
                    if (json?.Data?.Sets) {
                        albumData = json.Data;
                        createFloatingButton();
                    }
                } catch(e) {}
            }
        });
        return rawOpen.apply(this, arguments);
    };

    // Patch Fetch (Version passive pour ne pas bloquer la boutique)
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch(...args).then(response => {
            const url = (typeof args[0] === 'string') ? args[0] : args[0].url;
            if (url && url.includes('sticker-trading')) {
                                response.clone().json().then(json => {
                    if (json?.Data?.Sets) {
                        albumData = json.Data;
                        createFloatingButton();
                    }
                }).catch(() => {});
            }
            return response;
        });
    };

    // --- Logique de rendu (Inchangée) ---
    function generateContent() {
        let mLines = [], dLines = [];
        let rawM = "❌ MES MANQUANTES :\n", rawD = "✅ MES DOUBLES :\n";
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
        const mid = Math.ceil(mLines.length / 2);
        return { mCol1: mLines.slice(0, mid).join(''), mCol2: mLines.slice(mid).join(''), dCol: dLines.join(''), rawM, rawD };
    }

    function copyToClipboard(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            const old = btn.innerHTML;
            btn.innerHTML = "✅ Copié !";
            btn.style.background = "#27ae60";
            setTimeout(() => { btn.innerHTML = old; btn.style.background = "#666"; }, 2000);
        });
    }

    function createFloatingButton() {
        if (document.getElementById('btn-album-float')) return;
        const b = document.createElement('button');
        b.id = 'btn-album-float';
        b.innerHTML = '🐾 Bilan Album';
        b.setAttribute('style', 'position:fixed;bottom:25px;right:25px;z-index:9999;padding:12px 20px;background:#4287f5;color:white;border-radius:30px;border:none;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(66,135,245,0.4);');
        b.onclick = showModal;
        document.body.appendChild(b);
    }

    function showModal() {
        const existing = document.getElementById('album-modal-overlay');
        if (existing) existing.remove();
        const data = generateContent();
        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');
        overlay.innerHTML = `
            <div style="width:900px; max-width:95%; max-height:85vh; background:#f8f9fa; border-radius:15px; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,0.3); font-family: sans-serif; display:flex; flex-direction:column;">
                <div style="padding:15px 20px; background:#4287f5; color:white; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">🐾 Mon Album Monopoly Go - @2026 Droopygoon - V${CURRENT_VERSION}</h2>
                    <button id="close-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:5px 12px; border-radius:5px; cursor:pointer;">Fermer</button>
                </div>
                <div style="padding:10px 20px; background:#eee; border-bottom:1px solid #ddd; display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" id="toggle-gold" ${showGolds ? 'checked' : ''}>
                    <label for="toggle-gold" style="cursor:pointer; font-size:0.85rem;">Afficher les cartes Or [Golds]</label>
                </div>
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; padding:20px; overflow-y:auto; background:#fff;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ffebeb; margin-bottom:10px; padding-bottom:5px;">
                            <h3 style="margin:0; color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3>
                            <button id="copy-m" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;">
                            <div>${data.mCol1}</div><div>${data.mCol2}</div>
                        </div>
                    </div>
                    <div style="border-left:1px solid #eee; padding-left:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e8f5e9; margin-bottom:10px; padding-bottom:5px;">
                            <h3 style="margin:0; color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3>
                            <button id="copy-d" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button>
                        </div>
                        <div style="font-family:monospace; font-size:0.85rem;">${data.dCol}</div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('copy-m').onclick = (e) => copyToClipboard(data.rawM, e.target);
        document.getElementById('copy-d').onclick = (e) => copyToClipboard(data.rawD, e.target);
        document.getElementById('toggle-gold').onchange = (e) => { showGolds = e.target.checked; showModal(); };
    }
})();
