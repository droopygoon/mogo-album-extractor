// ==UserScript==
// @name          Monopoly Go - Album Extractor
// @namespace     UserScripts
// @match         https://*.monopolygo.com/*
// @grant         GM_xmlhttpRequest
// @connect       firestore.googleapis.com
// @version       1.96
// @author        Droopygoon
// @downloadURL   https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// @updateURL     https://droopygoon.github.io/mogo-album-extractor/extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CURRENT_VERSION = "1.96";
    
    // --- CONFIGURATION FIREBASE ---
    const FIREBASE_PROJECT_ID = "mogo-album-extractor"; 
    const FB_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/players_data`;

    let albumData = null;
    let showGolds = true;
    let currentActiveTab = 'view';
    
    let lastLoadedFriendData = null;
    let lastGlobalResultsData = null;

    const SECURITY_QUESTIONS = [
        "1. Quel est le nom de votre premier animal de compagnie ?",
        "2. Dans quelle ville êtes-vous né(e) ?",
        "3. Quel est le nom de jeune fille de votre mère ?",
        "4. Quel était le modèle de votre première voiture ?"
    ];

    // --- Gestion Notification ---
    function checkUpdateNotification() {
        const lastVersion = localStorage.getItem('mgo_extractor_version');
        if (lastVersion && lastVersion !== CURRENT_VERSION) {
            showUpdateToast(`🚀 v${CURRENT_VERSION} : Sécurisation optionnelle par mot de passe & récupération par question secrète !`);
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
        const isOldFormat = id && (!id.includes('-') || id.length < 8);
        if (!id || isOldFormat) {
            const name = getPlayerNameFromDOM();
            const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            id = `${name}-${suffix}`;
            localStorage.setItem('mgo_user_id', id);
        }
        return id;
    }

    function getLocalFavsObj() {
        const raw = localStorage.getItem('mgo_saved_friends_v2') || localStorage.getItem('mgo_saved_friends') || "[]";
        try {
            const parsed = JSON.parse(raw);
            let obj = {};
            if (Array.isArray(parsed)) {
                parsed.forEach(item => {
                    if (item.includes('|')) {
                        const [id, alias] = item.split('|');
                        obj[id.trim().toUpperCase()] = alias.trim();
                    } else {
                        obj[item.trim().toUpperCase()] = "";
                    }
                });
            } else { obj = parsed; }
            return obj;
        } catch(e) { return {}; }
    }

    function saveLocalFavsObj(obj) {
        const arrFormat = Object.keys(obj).map(id => obj[id] ? `${id}|${obj[id]}` : id);
        localStorage.setItem('mgo_saved_friends_v2', JSON.stringify(arrFormat));
        localStorage.setItem('mgo_saved_friends', JSON.stringify(arrFormat));
    }

    function formatDate(dateStr) {
        if (!dateStr) return "Inconnue";
        const d = new Date(dateStr);
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function daysBetween(dateStr1, dateStr2) {
        if (!dateStr1) return 999;
        const d1 = new Date(dateStr1);
        const d2 = new Date(dateStr2);
        return Math.floor(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
    }

    // --- Communications Cloud (Firebase) ---
    async function syncToCloud(data, extraSecurity = {}) {
        const userId = getOrCreateUserID();
        const favsObj = getLocalFavsObj();
        const arrFormat = Object.keys(favsObj).map(id => favsObj[id] ? `${id}|${favsObj[id]}` : id);
        
        // Mot de passe local enregistré
        const storedPass = localStorage.getItem('mgo_user_password') || "";

        const fields = {
            user_id: { stringValue: userId },
            missing_text: { stringValue: data.rawM },
            doubles_text: { stringValue: data.rawD },
            friends_list: { arrayValue: { values: arrFormat.map(f => ({ stringValue: f })) } },
            updated_at: { stringValue: new Date().toISOString() }
        };

        if (storedPass) {
            fields.password_hash = { stringValue: storedPass };
        }

        if (extraSecurity.password) {
            fields.password_hash = { stringValue: extraSecurity.password };
        }
        if (extraSecurity.secQuestion) {
            fields.sec_question = { stringValue: String(extraSecurity.secQuestion) };
        }
        if (extraSecurity.secAnswer) {
            fields.sec_answer = { stringValue: extraSecurity.secAnswer.toLowerCase().trim() };
        }

        const payload = { fields };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "PATCH", 
                url: `${FB_BASE_URL}/${userId}`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(payload),
                onload: (res) => (res.status >= 200 && res.status < 300) ? resolve(true) : reject(`Erreur Firebase ${res.status}`),
                onerror: () => reject("Erreur Réseau")
            });
        });
    }

    async function fetchPlayerData(targetId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${FB_BASE_URL}/${targetId.toUpperCase().trim()}`,
                headers: { "Content-Type": "application/json" },
                onload: (res) => {
                    if (res.status === 404) { reject("ID introuvable"); return; }
                    try {
                        const result = JSON.parse(res.responseText);
                        const fields = result.fields;
                        if (fields) {
                            const rawFriends = fields.friends_list?.arrayValue?.values?.map(v => v.stringValue) || [];
                            resolve({
                                user_id: fields.user_id?.stringValue || targetId,
                                missing_text: fields.missing_text?.stringValue || "",
                                doubles_text: fields.doubles_text?.stringValue || "",
                                updated_at: fields.updated_at?.stringValue || "",
                                friends_list: rawFriends,
                                has_password: !!fields.password_hash?.stringValue,
                                sec_question: fields.sec_question?.stringValue || ""
                            });
                        } else { reject("Données vides"); }
                    } catch(e) { reject("Données invalides"); }
                },
                onerror: () => reject("Erreur Réseau")
            });
        });
    }

    // --- Interception des données réseau ---
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
                const ids = match[2].split(',')
                                    .map(id => id.trim().replace('[','').replace(']',''))
                                    .filter(id => id.length > 0); 
                if(ids.length > 0) result[setNum] = ids;
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
                    else { rawMList.push(`[${id}]`); } 
                }
                else if (s.OwnedCount > 1) {
                    if (!isGold) { dList.push(id); rawDList.push(id); }
                    else if (showGolds) { dList.push(`<span style="color:#d4af37;font-weight:bold;">[${id}]</span>`); rawDList.push(`[${id}]`); }
                    else { rawDList.push(`[${id}]`); }
                }
            });
            const badge = `<span style="display:inline-block;width:25px;color:#4287f5;font-weight:bold;">${i+1}-</span>`;
            if (mList.length) mLines.push(`<div>${badge}${mList.join(',')}</div>`);
            if (dList.length) dLines.push(`<div>${badge}${dList.join(',')}</div>`);
            
            if (rawMList.length) rawM += `${i+1}-${rawMList.join(',')}\n`;
            if (rawDList.length) rawD += `${i+1}-${rawDList.join(',')}\n`;
        });
        return { mHtml: mLines.join(''), dHtml: dLines.join(''), rawM, rawD };
    }

    function createFloatingButton() {
        if (document.getElementById('btn-album-float')) return;
        const b = document.createElement('button');
        b.id = 'btn-album-float'; b.innerHTML = '🐾 Bilan Album';
        b.setAttribute('style', 'position:fixed;bottom:25px;right:25px;z-index:9999;padding:12px 20px;background:#4287f5;color:white;border-radius:30px;border:none;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(66,135,245,0.4);');
        b.onclick = () => showModal('view'); document.body.appendChild(b);
    }

    async function showModal(activeTab = 'view') {
        currentActiveTab = activeTab;
        const myId = getOrCreateUserID();
        let myRemoteData = null;

        try {
            myRemoteData = await fetchPlayerData(myId);
            if (myRemoteData && Array.isArray(myRemoteData.friends_list)) {
                let mergedObj = getLocalFavsObj();
                myRemoteData.friends_list.forEach(item => {
                    if (item.includes('|')) {
                        const [id, alias] = item.split('|');
                        mergedObj[id.trim().toUpperCase()] = alias.trim();
                    } else if (!mergedObj[item.trim().toUpperCase()]) {
                        mergedObj[item.trim().toUpperCase()] = "";
                    }
                });
                saveLocalFavsObj(mergedObj);
            }
        } catch(e) {}

        const existing = document.getElementById('album-modal-overlay');
        if (existing) existing.remove();

        const data = generateContent();
        const overlay = document.createElement('div');
        overlay.id = 'album-modal-overlay';
        overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(3px);');

        const favsObj = getLocalFavsObj();
        const friendsOptions = Object.keys(favsObj).map(id => {
            const displayName = favsObj[id] ? `${favsObj[id]} (${id})` : id;
            return `<option value="${id}">${displayName}</option>`;
        }).join('');

        const isProtected = myRemoteData?.has_password || !!localStorage.getItem('mgo_user_password');

        overlay.innerHTML = `
            <div style="width:950px; max-width:95%; max-height:90vh; background:#f8f9fa; border-radius:15px; overflow:hidden; display:flex; flex-direction:column; font-family:sans-serif;">
                <div style="padding:15px 20px; background:#4287f5; color:white; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">🐾 Album Extractor - V${CURRENT_VERSION}</h2>
                    <button id="close-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; padding:5px 12px; border-radius:5px; cursor:pointer;">Fermer</button>
                </div>
                <div style="display:flex; background:#eee; border-bottom:1px solid #ddd;">
                    <button id="tab-view" style="flex:1; padding:12px; border:none; background:${activeTab=='view'?'#fff':'#eee'}; cursor:pointer; font-weight:bold;">Mon Inventaire</button>
                    <button id="tab-compare" style="flex:1; padding:12px; border:none; background:${activeTab=='comp'?'#fff':'#eee'}; cursor:pointer; font-weight:bold; border-left:1px solid #ddd;">🤝 Comparer 1 à 1</button>
                    <button id="tab-search-global" style="flex:1; padding:12px; border:none; background:${activeTab=='global'?'#fff':'#eee'}; cursor:pointer; font-weight:bold; border-left:1px solid #ddd; color:#27ae60;">🔎 Recherche Globale</button>
                </div>

                <!-- ONGLET 1 : MON INVENTAIRE -->
                <div id="content-view" style="display:${activeTab==='view'?'block':'none'}; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background:#f0f7ff; padding:10px; border-radius:8px; border:1px solid #bae0ff; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <strong>ID : <span id="display-my-id" style="color:#4287f5; font-size:1.1rem;">${myId}</span></strong>
                            <button id="copy-my-id" style="background:#4287f5; color:white; border:none; padding:6px 10px; font-size:0.75rem; border-radius:4px; cursor:pointer;">Copier</button>
                            <button id="import-my-id" style="background:#666; color:white; border:none; padding:6px 10px; font-size:0.75rem; border-radius:4px; cursor:pointer;">Importer ID</button>
                            <button id="btn-sec-config" style="background:${isProtected?'#27ae60':'#e67e22'}; color:white; border:none; padding:6px 10px; font-size:0.75rem; border-radius:4px; cursor:pointer; font-weight:bold;">${isProtected?'🔒 Sécurisé':'🔓 Sécuriser ID'}</button>
                        </div>
                        <button id="btn-sync-cloud" style="background:#27ae60; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">☁️ Partager mon Album</button>
                    </div>

                    <!-- PANNEAU SÉCURITÉ -->
                    <div id="sec-panel" style="display:none; background:#fff3cd; border:1px solid #ffeeba; padding:15px; border-radius:8px; margin-bottom:15px;">
                        <h4 style="margin:0 0 10px 0; color:#856404;">🔒 Sécurisation de l'ID</h4>
                        <div style="display:flex; flex-direction:column; gap:10px; max-width:500px;">
                            <input type="password" id="sec-pass-input" placeholder="Mot de passe (enregistré automatiquement)..." style="padding:8px; border-radius:5px; border:1px solid #ccc;">
                            
                            <label style="font-size:0.8rem; font-weight:bold; color:#856404;">Question de sécurité en cas d'oubli :</label>
                            <select id="sec-q-select" style="padding:8px; border-radius:5px; border:1px solid #ccc; background:white;">
                                ${SECURITY_QUESTIONS.map((q, idx) => `<option value="${idx+1}">${q}</option>`).join('')}
                            </select>
                            <input type="text" id="sec-a-input" placeholder="Réponse à la question..." style="padding:8px; border-radius:5px; border:1px solid #ccc;">
                            
                            <div style="display:flex; gap:10px;">
                                <button id="btn-save-sec" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">Enregistrer la protection</button>
                                <button id="btn-reset-sec" style="background:#d35400; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; display:${myRemoteData?.has_password?'inline-block':'none'};">Réinitialiser (Mot de passe oublié ?)</button>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom:15px; display:flex; align-items:center; gap:10px; font-size:0.85rem;">
                        <input type="checkbox" id="toggle-gold-view" class="toggle-gold-cb" ${showGolds ? 'checked' : ''}> <label for="toggle-gold-view">Afficher les Ors [Golds]</label>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:20px;">
                        <div style="flex:1; min-width:300px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #ffebeb; margin-bottom:10px;"><h3 style="color:#e44d26; font-size:0.9rem;">❌ MANQUANTES</h3><button id="copy-m" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button></div>
                            <div id="my-missing-container" style="font-family:monospace; font-size:0.85rem;">${data.mHtml || "Aucune"}</div>
                        </div>
                        <div style="flex:1; min-width:300px; border-left:1px solid #eee; padding-left:10px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #e8f5e9; margin-bottom:10px;"><h3 style="color:#27ae60; font-size:0.9rem;">✅ DOUBLES</h3><button id="copy-d" style="background:#666; color:white; border:none; padding:3px 8px; font-size:0.7rem; border-radius:3px; cursor:pointer;">Copier</button></div>
                            <div id="my-doubles-container" style="font-family:monospace; font-size:0.85rem;">${data.dHtml || "Aucune"}</div>
                        </div>
                    </div>
                </div>

                <!-- ONGLET 2 : COMPARER 1 À 1 -->
                <div id="content-compare" style="display:${activeTab==='comp'?'block':'none'}; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px;">
                        <h4 style="margin:0 0 10px 0; color:#4287f5;">1. Charger un ami</h4>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <select id="friend-select" style="width:220px; padding:10px; border-radius:8px; border:1px solid #ddd; background:white;">
                                <option value="">-- Favoris / Amis --</option>
                                ${friendsOptions}
                            </select>
                            <input type="text" id="friend-id-input" placeholder="ID de l'ami..." style="flex:1; min-width:150px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                            <input type="text" id="friend-alias-input" placeholder="Surnom (max 20car, remplace espace)..." style="width:220px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                            <button id="btn-load-friend" style="padding:10px 20px; background:#4287f5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Récupérer</button>
                            <button id="btn-save-friend" style="display:none; padding:10px; background:#f39c12; color:white; border:none; border-radius:8px; cursor:pointer; width:44px;" title="Sauvegarder / Modifier l'ami">⭐</button>
                            <button id="btn-del-friend" style="display:none; padding:10px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer; width:44px;" title="Supprimer l'ami">🗑️</button>
                        </div>
                        <div id="friend-status" style="margin-top:8px; font-size:0.85rem; color:#666;"></div>
                    </div>
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <h4 style="margin:0; color:#666;">2. Détails & Comparaison</h4>
                            <div style="font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                                <input type="checkbox" id="toggle-gold-compare" class="toggle-gold-cb" ${showGolds ? 'checked' : ''}> <label for="toggle-gold-compare">Afficher les Ors [Golds]</label>
                            </div>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:15px;">
                            <div style="flex:1; min-width:280px;">
                                <label style="display:block; font-size:0.75rem; font-weight:bold; color:#e44d26; margin-bottom:5px;">SES MANQUANTES</label>
                                <textarea id="friend-missing" style="width:100%; height:100px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem; resize:none; box-sizing:border-box;"></textarea>
                            </div>
                            <div style="flex:1; min-width:280px;">
                                <label style="display:block; font-size:0.75rem; font-weight:bold; color:#27ae60; margin-bottom:5px;">SES DOUBLES</label>
                                <textarea id="friend-doubles" style="width:100%; height:100px; padding:8px; border-radius:8px; border:1px solid #ddd; font-family:monospace; font-size:0.75rem; resize:none; box-sizing:border-box;"></textarea>
                            </div>
                        </div>
                        <button id="run-manual-compare" style="width:100%; padding:10px; background:#eee; border:1px solid #ccc; border-radius:8px; cursor:pointer; font-weight:bold; margin-bottom:10px;">Comparer manuellement</button>
                    </div>
                    <div id="compare-results" style="display:flex; flex-wrap:wrap; gap:20px; border-top:2px solid #f0f0f0; padding-top:20px;"></div>
                </div>

                <!-- ONGLET 3 : RECHERCHE GLOBALE -->
                <div id="content-global" style="display:${activeTab==='global'?'block':'none'}; padding:20px; overflow-y:auto; background:#fff;">
                    <div style="background:#eafaf1; padding:15px; border-radius:10px; border:1px solid #d4efdf; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                        <div>
                            <h3 style="margin:0 0 5px 0; color:#27ae60;">🔎 Qui a mes cartes manquantes ?</h3>
                            <p style="margin:0; font-size:0.85rem; color:#555;">Dresse la liste croisée uniquement pour les cartes trouvées chez vos amis.</p>
                        </div>
                        <div style="display:flex; align-items:center; gap:15px; font-size:0.85rem; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:5px; font-weight:bold;">
                                <input type="checkbox" id="toggle-gold-global" class="toggle-gold-cb" ${showGolds ? 'checked' : ''}> <label for="toggle-gold-global">Afficher les Ors [Golds]</label>
                            </div>
                            <div>
                                <label for="filter-days">Actifs depuis :</label>
                                <select id="filter-days" style="padding:5px; border-radius:5px; border:1px solid #ccc; background:white;">
                                    <option value="1" selected>Aujourd'hui</option>
                                    <option value="3">3 jours</option>
                                    <option value="7">7 jours</option>
                                    <option value="15">15 jours</option>
                                    <option value="999">Tout voir</option>
                                </select>
                            </div>
                            <button id="btn-run-global" style="padding:10px 20px; background:#27ae60; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 10px rgba(39,174,96,0.3);">Lancer la Recherche</button>
                        </div>
                    </div>
                    <div id="global-loading" style="display:none; text-align:center; padding:20px; font-weight:bold; color:#666;">⌛ Analyse en cours... <span id="global-progress">0/0</span></div>
                    <div id="global-results-container" style="display:grid; grid-template-columns: 1fr; gap:15px;">
                        <p style="color:#888; font-style:italic; text-align:center; padding:20px;">Cliquez sur le bouton ci-dessus pour lancer la recherche globale.</p>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // --- Références UI Elements ---
        const fInput = document.getElementById('friend-id-input');
        const fAlias = document.getElementById('friend-alias-input');
        const fSelect = document.getElementById('friend-select');
        const btnLoad = document.getElementById('btn-load-friend');
        const btnSave = document.getElementById('btn-save-friend');
        const btnDel = document.getElementById('btn-del-friend');
        const secPanel = document.getElementById('sec-panel');

        fAlias.oninput = function() {
            let val = fAlias.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9À-ÿ_\-.,@]/g, '');
            if (val.length > 20) val = val.substring(0, 20);
            fAlias.value = val;
        };

        const updateFavButtons = (id) => {
            const favs = getLocalFavsObj();
            const upperID = id.trim().toUpperCase();
            if (!upperID) { btnSave.style.display = 'none'; btnDel.style.display = 'none'; return; }
            const exists = upperID in favs;
            btnSave.style.display = 'block';
            btnSave.innerHTML = exists ? "💾" : "⭐";
            btnSave.title = exists ? "Modifier l'alias" : "Ajouter aux favoris";
            btnDel.style.display = exists ? 'block' : 'none';
        };

        const copyToClip = (text, btn, msg = "Copié !") => {
            navigator.clipboard.writeText(text).then(() => {
                const old = btn.innerHTML; btn.innerHTML = msg;
                if(btn.id !== "btn-sync-cloud") btn.style.background = "#27ae60";
                setTimeout(() => {
                    btn.innerHTML = old;
                    if(btn.id !== "btn-sync-cloud") btn.style.background = (btn.id === "copy-my-id" || btn.id === "btn-load-friend") ? "#4287f5" : "#666";
                }, 2000);
            });
        };

        const runCompareLogic = (fMissingRaw, fDoublesRaw) => {
            const fMissing = parseFriendData(fMissingRaw), fDoubles = parseFriendData(fDoublesRaw);
            const resultsDiv = document.getElementById('compare-results');
            let canGet = "", canGive = "";
            
            albumData.Sets.forEach((set, i) => {
                let setNum = i + 1, getList = [], giveList = [];
                set.Stickers.forEach(s => {
                    let id = s.StickerId.split('.').pop();
                    let isGold = [9,10,11].includes(s.Rarity);
                    if (isGold && !showGolds) return; 
                    
                    const displayId = isGold ? `<span style="color:#d4af37;font-weight:bold;">[${id}]</span>` : id;
                    if (s.OwnedCount === 0 && fDoubles[setNum]?.includes(id)) getList.push(displayId);
                    if (s.OwnedCount > 1 && fMissing[setNum]?.includes(id)) giveList.push(displayId);
                });
                const badge = `<span style="font-weight:bold; color:#4287f5;">${setNum}-</span>`;
                if (getList.length) canGet += `<div>${badge}${getList.join(',')}</div>`;
                if (giveList.length) canGive += `<div>${badge}${giveList.join(',')}</div>`;
            });
            resultsDiv.innerHTML = `
                <div style="flex:1; min-width:250px; background:#e8f5e9; padding:15px; border-radius:10px; border:1px solid #c8e6c9;"><h4 style="margin:0 0 10px 0; color:#2e7d32;">🎁 Recevables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGet || "Aucun"}</div></div>
                <div style="flex:1; min-width:250px; background:#fff3e0; padding:15px; border-radius:10px; border:1px solid #ef6c00;"><h4 style="margin:0 0 10px 0; color:#ef6c00;">🤝 Donnables :</h4><div style="font-family:monospace; font-size:0.85rem;">${canGive || "Aucun"}</div></div>`;
        };

        const renderGlobalUI = () => {
            const resultsContainer = document.getElementById('global-results-container');
            if (!lastGlobalResultsData || lastGlobalResultsData.length === 0) return;

            let globalHtml = [];
            let totalCorrelations = 0;

            albumData.Sets.forEach((set, i) => {
                let setNum = i + 1;
                let setHtmlMatches = [];

                set.Stickers.forEach(s => {
                    let id = s.StickerId.split('.').pop();
                    let isGold = [9,10,11].includes(s.Rarity);
                    if (isGold && !showGolds) return; 

                    if (s.OwnedCount === 0) {
                        let providers = [];
                        lastGlobalResultsData.forEach(friend => {
                            if (friend.doubles[setNum] && friend.doubles[setNum].includes(id)) {
                                providers.push(`<b style="color:#27ae60;">${friend.alias}</b>`);
                            }
                        });

                        if (providers.length > 0) {
                            totalCorrelations++;
                            const displayId = isGold ? `<span style="color:#d4af37;font-weight:bold;">[${id}]</span>` : `<b>${id}</b>`;
                            setHtmlMatches.push(`<div style="padding:6px 0; border-bottom:1px dashed #eee; font-size:0.85rem;">Sticker ${displayId} disponible chez : ${providers.join(', ')}</div>`);
                        }
                    }
                });

                if (setHtmlMatches.length > 0) {
                    globalHtml.push(`
                        <div style="background:#fff; border:1px solid #ddd; border-radius:8px; padding:12px; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                            <h4 style="margin:0 0 10px 0; color:#4287f5; border-bottom:2px solid #f0f4f8; padding-bottom:5px;">Set ${setNum}</h4>
                            <div>${setHtmlMatches.join('')}</div>
                        </div>
                    `);
                }
            });

            if (totalCorrelations === 0) {
                resultsContainer.innerHTML = `<p style="color:#999; text-align:center; padding:20px; font-style:italic;">Aucune corrélation trouvée (aucun de vos amis actifs n'a de double pour vos cartes manquantes).</p>`;
            } else {
                resultsContainer.innerHTML = `
                    <div style="margin-bottom:10px; font-size:0.9rem; color:#666;">
                        Affichage de <b>${totalCorrelations}</b> correspondance(s) directe(s).
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">
                        ${globalHtml.join('')}
                    </div>`;
            }
        };

        // --- Événements Clicks ---
        document.getElementById('btn-sec-config').onclick = () => {
            secPanel.style.display = (secPanel.style.display === 'none') ? 'block' : 'none';
        };

        document.getElementById('btn-save-sec').onclick = async () => {
            const pass = document.getElementById('sec-pass-input').value.trim();
            const q = document.getElementById('sec-q-select').value;
            const a = document.getElementById('sec-a-input').value.trim();

            if (!pass || !a) {
                alert("Veuillez renseigner un mot de passe ET une réponse à la question de sécurité.");
                return;
            }

            try {
                await syncToCloud(data, { password: pass, secQuestion: q, secAnswer: a });
                localStorage.setItem('mgo_user_password', pass);
                alert("🔒 Sécurité activée avec succès ! Le mot de passe a été mémorisé sur ce navigateur.");
                showModal('view');
            } catch(e) {
                alert("❌ Erreur lors de l'enregistrement de la sécurité.");
            }
        };

        document.getElementById('btn-reset-sec').onclick = async () => {
            const q = document.getElementById('sec-q-select').value;
            const a = document.getElementById('sec-a-input').value.trim();
            const newPass = prompt("Indiquez votre NOUVEAU mot de passe :");

            if (!a || !newPass || !newPass.trim()) {
                alert("Veuillez remplir la réponse à la question et indiquer un nouveau mot de passe.");
                return;
            }

            try {
                await syncToCloud(data, { password: newPass.trim(), secQuestion: q, secAnswer: a });
                localStorage.setItem('mgo_user_password', newPass.trim());
                alert("✅ Mot de passe réinitialisé et mémorisé avec succès !");
                showModal('view');
            } catch(e) {
                alert("❌ Échec de la réinitialisation : Réponse de sécurité incorrecte ou erreur réseau.");
            }
        };

        document.getElementById('copy-my-id').onclick = (e) => copyToClip(myId, e.target);
        document.getElementById('import-my-id').onclick = () => {
            const newId = prompt("Collez l'ID à importer :", myId);
            if (newId && newId.trim() !== "") {
                localStorage.setItem('mgo_user_id', newId.trim().toUpperCase());
                localStorage.removeItem('mgo_user_password'); // Réinitialise le mot de passe local si on change d'ID
                showModal('view');
            }
        };

        document.getElementById('btn-sync-cloud').onclick = async (e) => {
            const btn = e.target; btn.innerHTML = "...⌛..."; btn.disabled = true;
            try { 
                await syncToCloud(data); 
                btn.innerHTML = "✅ Partagé !"; 
            }
            catch (err) { 
                btn.innerHTML = "❌ Accès Refusé"; 
                alert("⚠️ Erreur de synchronisation. Si vous avez protégé cet ID, vérifiez que le mot de passe est bien configuré sur ce navigateur.");
            }
            setTimeout(() => { btn.innerHTML = "☁️ Partager mon Album"; btn.disabled = false; }, 2500);
        };

        fSelect.onchange = () => { 
            const id = fSelect.value; fInput.value = id; 
            fAlias.value = favsObj[id] || ""; updateFavButtons(id); 
        };
        fInput.oninput = () => { fAlias.value = favsObj[fInput.value.trim().toUpperCase()] || ""; updateFavButtons(fInput.value); };

        btnLoad.onclick = async () => {
            const id = fInput.value.trim(); if (!id) return;
            btnLoad.innerHTML = "⌛...";
            try {
                const friendData = await fetchPlayerData(id);
                lastLoadedFriendData = friendData; 
                document.getElementById('friend-missing').value = friendData.missing_text;
                document.getElementById('friend-doubles').value = friendData.doubles_text;
                document.getElementById('friend-status').innerHTML = `📅 Mis à jour : <b>${formatDate(friendData.updated_at)}</b>`;
                runCompareLogic(friendData.missing_text, friendData.doubles_text);
                btnLoad.innerHTML = "Récupérer"; updateFavButtons(id);
            } catch (err) { alert(err); btnLoad.innerHTML = "Récupérer"; }
        };

        btnSave.onclick = async () => {
            const id = fInput.value.trim().toUpperCase(); if (!id) return;
            let currentFavs = getLocalFavsObj();
            currentFavs[id] = fAlias.value.trim();
            saveLocalFavsObj(currentFavs);
            try { await syncToCloud(data); showModal('comp'); } catch(e) { alert("Erreur Cloud"); }
        };

        btnDel.onclick = async () => {
            const id = fInput.value.trim().toUpperCase();
            if (confirm(`Supprimer ${id} des favoris ?`)) {
                let currentFavs = getLocalFavsObj(); delete currentFavs[id];
                saveLocalFavsObj(currentFavs);
                try { await syncToCloud(data); showModal('comp'); } catch(e) { alert("Erreur Cloud"); }
            }
        };

        document.getElementById('btn-run-global').onclick = async () => {
            const currentFavs = getLocalFavsObj();
            const friendIds = Object.keys(currentFavs);
            const maxDays = parseInt(document.getElementById('filter-days').value);
            const resultsContainer = document.getElementById('global-results-container');
            const loadingDiv = document.getElementById('global-loading');
            const progressSpan = document.getElementById('global-progress');

            if (friendIds.length === 0) {
                resultsContainer.innerHTML = `<p style="color:#e44d26; text-align:center; padding:20px; font-weight:bold;">❌ Aucun ami enregistré en favori.</p>`;
                return;
            }

            resultsContainer.innerHTML = ""; loadingDiv.style.display = "block";
            lastGlobalResultsData = [];
            let processedCount = 0; progressSpan.textContent = `0/${friendIds.length}`;

            const promises = friendIds.map(async (id) => {
                try {
                    const fData = await fetchPlayerData(id);
                    processedCount++; progressSpan.textContent = `${processedCount}/${friendIds.length}`;
                    
                    const days = daysBetween(fData.updated_at, new Date().toISOString());
                    if (days <= maxDays) {
                        lastGlobalResultsData.push({
                            id: id,
                            alias: currentFavs[id] || id, 
                            missing: parseFriendData(fData.missing_text),
                            doubles: parseFriendData(fData.doubles_text)
                        });
                    }
                } catch(e) {
                    processedCount++; progressSpan.textContent = `${processedCount}/${friendIds.length}`;
                }
            });

            await Promise.all(promises);
            loadingDiv.style.display = "none";
            renderGlobalUI();
        };

        document.querySelectorAll('.toggle-gold-cb').forEach(cb => {
            cb.onchange = (e) => {
                showGolds = e.target.checked;
                document.querySelectorAll('.toggle-gold-cb').forEach(box => box.checked = showGolds);
                
                if (currentActiveTab === 'view') {
                    const freshData = generateContent();
                    document.getElementById('my-missing-container').innerHTML = freshData.mHtml || "Aucune";
                    document.getElementById('my-doubles-container').innerHTML = freshData.dHtml || "Aucune";
                } 
                else if (currentActiveTab === 'comp' && lastLoadedFriendData) {
                    runCompareLogic(lastLoadedFriendData.missing_text, lastLoadedFriendData.doubles_text);
                } 
                else if (currentActiveTab === 'global' && lastGlobalResultsData) {
                    renderGlobalUI();
                }
            };
        });

        document.getElementById('tab-view').onclick = () => showModal('view');
        document.getElementById('tab-compare').onclick = () => showModal('comp');
        document.getElementById('tab-search-global').onclick = () => showModal('global');
        document.getElementById('close-modal').onclick = () => overlay.remove();
        document.getElementById('run-manual-compare').onclick = () => runCompareLogic(document.getElementById('friend-missing').value, document.getElementById('friend-doubles').value);
        document.getElementById('copy-m').onclick = (e) => copyToClip("❌ MANQUANTES :\n" + data.rawM, e.target);
        document.getElementById('copy-d').onclick = (e) => copyToClip("✅ DOUBLES :\n" + data.rawD, e.target);
    }
})();
