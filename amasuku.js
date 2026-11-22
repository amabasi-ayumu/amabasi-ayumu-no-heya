
    function openInBackground(url) {
            const newTab = window.open(url, '_blank');
    if (newTab) window.focus();
        }

    function extractCleanName(rawName) {
            if (!rawName) return '';
    let str = String(rawName);
    try {str = decodeURIComponent(str); } catch(e) { }

    str = str.replace(/<[^>]*>/g, '');
    str = str.replace(/(?:alt|title|src|href|class|id|style)\s*=\s*["'][^"']*["']/gi, '');
    str = str.replace(/(?:alt|title|src|href|class|id|style)\s*=\s*\S+/gi, '');

    if (str.includes('/') || str.includes('\\')) {
                const parts = str.split(/[/\\]/);
    str = parts[parts.length - 1];
            }

    str = str.split('?')[0].split('#')[0].split('=')[0];
    str = str.replace(/["'<>]/g, '');
        return str.replace(/\.(html|htm|url|webloc|php|asp|jsp)$/i, '').trim();
        }

        document.getElementById('search-form').addEventListener('submit', function(e) {
            e.preventDefault();
        const query = this.q.value;
        if(query) openInBackground('https://www.google.com/search?q=' + encodeURIComponent(query));
        });

        document.getElementById('translate-form').addEventListener('submit', function(e) {
            e.preventDefault();
        const text = this.text.value;
        if(text) openInBackground('https://translate.google.co.jp/?sl=auto&tl=ja&text=' + encodeURIComponent(text) + '&op=translate');
        });

        document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
        if (link && link.getAttribute('target') === '_blank' && !link.classList.contains('html-file-link')) {
            e.preventDefault();
        openInBackground(link.href);
            }
        });

        // ==========================================
        // ▼ HTMLフォルダパスの固定（自動読み込み機能） ▼
        // ==========================================
        const DB_NAME = 'MasaSearchDB';
        const STORE_NAME = 'dirHandles';
        let isFolderRestored = false;
        let gestureRestoreAttempted = false;

        function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function saveDirectoryHandle(handle) {
            try {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, 'htmlFolder');
        tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            } catch(e) {console.error(e); }
        }

        async function loadDirectoryHandle() {
            try {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('htmlFolder');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            } catch(e) { return null; }
        }

        async function removeDirectoryHandle() {
            try {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete('htmlFolder');
        tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            } catch(e) { }
        }

        async function attemptSilentRestore() {
            const handle = await loadDirectoryHandle();
        if (!handle) return;

        if (await handle.queryPermission({mode: 'read' }) === 'granted') {
            await processDirectoryHandle(handle);
        isFolderRestored = true;
            } else {
            document.getElementById('restore-folder-btn').style.display = 'inline-block';
            }
        }

        async function attemptGestureRestore() {
            if (isFolderRestored || gestureRestoreAttempted) return;
        const handle = await loadDirectoryHandle();
        if (!handle) return;

        gestureRestoreAttempted = true;
        try {
                const options = {mode: 'read' };
        if ((await handle.queryPermission(options)) !== 'granted') {
                    const permission = await handle.requestPermission(options);
        if (permission !== 'granted') return;
                }
        await processDirectoryHandle(handle);
        isFolderRestored = true;
        document.getElementById('restore-folder-btn').style.display = 'none';
            } catch(e) {console.error("復元エラー:", e); }
        }

        async function forceRestoreHtmlFolder() {
            gestureRestoreAttempted = false;
        await attemptGestureRestore();
        }

        document.addEventListener('click', attemptGestureRestore);
        document.addEventListener('keydown', attemptGestureRestore);

        document.addEventListener('DOMContentLoaded', async () => {
            renderFavorites();
        renderShortcuts();

        const themeToggleBtn = document.getElementById('theme-toggle');
        const currentTheme = document.documentElement.getAttribute('data-theme');
        themeToggleBtn.innerText = currentTheme === 'dark' ? '☀️' : '🌙';

            themeToggleBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('myTheme', newTheme);
        themeToggleBtn.innerText = newTheme === 'dark' ? '☀️' : '🌙';
            });

        await attemptSilentRestore();
        });

        let htmlFolderHandleName = "";
        let htmlFileHandles = { };

        async function processDirectoryHandle(directory) {
            htmlFolderHandleName = directory.name;
        htmlFileHandles = { };

        let count = 0;
        for await (const entry of directory.values()) {
                if (entry.kind !== "file") continue;
        if (!entry.name.toLowerCase().endsWith(".html") && !entry.name.toLowerCase().endsWith(".htm")) continue;

        htmlFileHandles[entry.name] = entry;
        count++;
            }

            if (count > 0) {
            renderFavorites();
            } else {
            alert("HTMLファイルが見つかりませんでした。");
            }
        }

        async function selectHtmlFolder() {
            try {
                const directory = await window.showDirectoryPicker({id: 'masaHtmlFolderPicker' });
        await saveDirectoryHandle(directory);
        await processDirectoryHandle(directory);
        isFolderRestored = true;
        document.getElementById('restore-folder-btn').style.display = 'none';
            } catch (error) {
            console.log("フォルダ選択がキャンセルされました", error);
            }
        }

        async function openHTML(entry) {
            try {
                const file = await entry.getFile();
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
            } catch (error) {
            alert("ファイルを開けませんでした。");
            }
        }

        document.getElementById('url-folder-input').addEventListener('change', async function(e) {
            const files = e.target.files;
        if (files.length === 0) return;

        let existingDataStr = localStorage.getItem('myFolderFavoritesTree');
        let treeData = existingDataStr ? JSON.parse(existingDataStr) : {folders: { } };
        if (!treeData.folders) treeData.folders = { };

        let addedCount = 0;

        for (let i = 0; i < files.length; i++) {
                const file = files[i];
        if (file.name.toLowerCase().endsWith('.url') || file.name.toLowerCase().endsWith('.webloc')) {
                    const text = await file.text();
        let url = '';

        const urlMatchWin = text.match(/URL=(.+)/i);
        if (urlMatchWin) url = urlMatchWin[1].trim();
        else {
                        const urlMatchMac = text.match(/<string>(https?:\/\/[^<]+)<\/string>/i);
            if (urlMatchMac) url = urlMatchMac[1].trim();
                    }

            if (url) {
                        const cleanName = extractCleanName(file.name);
            const parts = (file.webkitRelativePath || file.name).split('/');
            let colName = 'URLリスト';
                        if (parts.length >= 2) {
                colName = extractCleanName(parts[parts.length - 2]);
                        }

            if (!treeData.folders[colName]) treeData.folders[colName] = [];
                        const isExist = treeData.folders[colName].some(item => item.url === url);
            if (!isExist) {
                treeData.folders[colName].push({ name: cleanName, url: url });
            addedCount++;
                        }
                    }
                }
            }

            if (addedCount > 0) {
                localStorage.setItem('myFolderFavoritesTree', JSON.stringify(treeData));
            renderFavorites();
            alert(`${addedCount} 件のURLショートカットを追加しました！`);
            } else {
                alert(`ショートカットファイルが見つかりませんでした。`);
            }
            e.target.value = '';
        });

            function createFolderHeader(titleText, colElement) {
            const header = document.createElement('div');
            header.className = 'folder-title';

            const inner = document.createElement('div');
            inner.className = 'folder-title-inner';

            const titleSpan = document.createElement('span');
            titleSpan.innerHTML = `📁 <span class="title-text">${titleText}</span>`;

            const pinBtn = document.createElement('button');
            pinBtn.className = 'pin-btn';
            pinBtn.title = 'フォルダーを固定 / 解除';

            let pinnedFolders = JSON.parse(localStorage.getItem('myPinnedFolders')) || { };
            if (pinnedFolders[titleText]) {
                pinBtn.textContent = '📌';
            colElement.classList.add('pinned');
            } else {
                pinBtn.textContent = '📍';
            }

            pinBtn.onclick = (e) => {
                e.stopPropagation();
            let pinned = JSON.parse(localStorage.getItem('myPinnedFolders')) || { };

            if (colElement.classList.contains('pinned')) {
                colElement.classList.remove('pinned');
            delete pinned[titleText];
            pinBtn.textContent = '📍';
                } else {
                colElement.classList.add('pinned');
            pinned[titleText] = true;
            pinBtn.textContent = '📌';
                }
            localStorage.setItem('myPinnedFolders', JSON.stringify(pinned));
            };

            inner.appendChild(titleSpan);
            inner.appendChild(pinBtn);
            header.appendChild(inner);
            return header;
        }

            function renderFavorites() {
            const content = document.getElementById('launcher-content');
            content.innerHTML = '';

            let count = 0;

            if (Object.keys(htmlFileHandles).length > 0) {
                count++;
            const col = document.createElement('div');
            col.className = 'folder-col';
            const folderName = extractCleanName(htmlFolderHandleName);

            col.appendChild(createFolderHeader(folderName, col));

            for (const [name, entry] of Object.entries(htmlFileHandles)) {
                    const a = document.createElement('a');
            a.className = 'dock-btn html-file-link';
            a.href = '#';
            a.onclick = function(e) {
                e.preventDefault();
            openHTML(entry);
                    };

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'icon-wrapper';

            const img = document.createElement('img');
            img.alt = '';
            img.onerror = function() {this.style.display = 'none'; };
            img.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239aa0a6"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>';

            iconWrapper.appendChild(img);

            const span = document.createElement('span');
            span.className = 'text';
            span.textContent = extractCleanName(name);

            a.appendChild(iconWrapper);
            a.appendChild(span);
            col.appendChild(a);
                }
            content.appendChild(col);
            }

            const dataStr = localStorage.getItem('myFolderFavoritesTree');
            if (dataStr) {
                const data = JSON.parse(dataStr);

            function createColumn(title, items) {
                    if (!items || items.length === 0) return;
            count++;

            const col = document.createElement('div');
            col.className = 'folder-col';
            const folderName = extractCleanName(title);

            col.appendChild(createFolderHeader(folderName, col));

                    items.forEach(fav => {
                        const a = document.createElement('a');
            a.className = 'dock-btn';
            a.href = fav.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'icon-wrapper';

            const img = document.createElement('img');
            img.alt = '';
            img.onerror = function() {this.style.display = 'none'; };

            img.src = `https://www.google.com/s2/favicons?domain=${fav.url}&sz=32`;
            iconWrapper.appendChild(img);

            const span = document.createElement('span');
            span.className = 'text';
            span.textContent = extractCleanName(fav.name);

            a.appendChild(iconWrapper);
            a.appendChild(span);
            col.appendChild(a);
                    });
            content.appendChild(col);
                }

            if (data.folders) {
                    for (const folderName in data.folders) {
                createColumn(folderName, data.folders[folderName]);
                    }
                }
            }

            if (count === 0) {
                content.innerHTML = '<div class="folder-col"><div class="folder-title">📁</div></div>';
            }
        }

            function clearFavorites() {
            if(confirm("左側に読み込んだリストをすべて消去してリセットしますか？\n（※メモリ上のHTMLフォルダパス・リストもクリアされます）")) {
                localStorage.removeItem('myFolderFavoritesTree');
            htmlFileHandles = { };
            removeDirectoryHandle();
            document.getElementById('restore-folder-btn').style.display = 'none';
            renderFavorites();
            }
        }

            // ==========================================
            // ▼ 右側サイドバー処理・ファイルの保存/読込 ▼
            // ==========================================

            function renderShortcuts() {
            const container = document.getElementById('shortcut-list');
            container.innerHTML = '';
            const shortcuts = JSON.parse(localStorage.getItem('myShortcuts')) || [];

            shortcuts.forEach((sc, index) => {
                const a = document.createElement('a');
            a.className = 'shortcut';
            a.href = sc.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'shortcut-icon';

            const img = document.createElement('img');
            img.alt = '';
            img.src = `https://www.google.com/s2/favicons?domain=${sc.url}&sz=64`;
            img.onerror = function() {this.style.display = 'none'; };

            iconWrapper.appendChild(img);

            const span = document.createElement('span');
            span.className = 'text';
            span.textContent = extractCleanName(sc.name);

            const ctrlContainer = document.createElement('div');
            ctrlContainer.className = 'shortcut-controls';

            const upBtn = document.createElement('div');
            upBtn.className = 'ctrl-btn' + (index === 0 ? ' disabled' : '');
            upBtn.textContent = '▲';
            upBtn.title = '上へ移動';
            upBtn.onclick = function(e) {moveShortcut(e, index, -1); };

            const downBtn = document.createElement('div');
            downBtn.className = 'ctrl-btn' + (index === shortcuts.length - 1 ? ' disabled' : '');
            downBtn.textContent = '▼';
            downBtn.title = '下へ移動';
            downBtn.onclick = function(e) {moveShortcut(e, index, 1); };

            const delBtn = document.createElement('div');
            delBtn.className = 'ctrl-btn del-btn';
            delBtn.textContent = '×';
            delBtn.title = '削除';
            delBtn.onclick = function(e) {deleteShortcut(e, index); };

            ctrlContainer.appendChild(upBtn);
            ctrlContainer.appendChild(downBtn);
            ctrlContainer.appendChild(delBtn);

            a.appendChild(iconWrapper);
            a.appendChild(span);
            a.appendChild(ctrlContainer);
            container.appendChild(a);
            });
        }

            function moveShortcut(event, index, direction) {
                event.preventDefault();
            event.stopPropagation();
            let shortcuts = JSON.parse(localStorage.getItem('myShortcuts')) || [];
            const newIndex = index + direction;

            if (newIndex < 0 || newIndex >= shortcuts.length) return;

            const targetItem = shortcuts.splice(index, 1)[0];
            shortcuts.splice(newIndex, 0, targetItem);
            localStorage.setItem('myShortcuts', JSON.stringify(shortcuts));
            renderShortcuts();
        }

            function deleteShortcut(event, index) {
                event.preventDefault();
            event.stopPropagation();
            if (confirm("このショートカットを削除しますか？")) {
                let shortcuts = JSON.parse(localStorage.getItem('myShortcuts')) || [];
            shortcuts.splice(index, 1);
            localStorage.setItem('myShortcuts', JSON.stringify(shortcuts));
            renderShortcuts();
            }
        }

            function addShortcut() {
            const name = prompt("ショートカットの名前を入力:\n（例: Yahoo!ニュース）");
            if (!name) return;
            let url = prompt("URLを入力:\n（例: https://news.yahoo.co.jp）");
            if (!url) return;
            if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

            const shortcuts = JSON.parse(localStorage.getItem('myShortcuts')) || [];
            shortcuts.push({name: extractCleanName(name), url: url });
            localStorage.setItem('myShortcuts', JSON.stringify(shortcuts));
            renderShortcuts();
        }

            // ==========================================
            // ▼ 追加機能：ショートカットのエクスポート / インポート ▼
            // ==========================================

            function exportShortcuts() {
            const dataStr = localStorage.getItem('myShortcuts') || '[]';
            const blob = new Blob([dataStr], {type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'shortcuts.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

            document.getElementById('import-shortcuts-input').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = JSON.parse(evt.target.result);
            if (Array.isArray(data)) {
                let existing = JSON.parse(localStorage.getItem('myShortcuts')) || [];
                        let existingUrls = new Set(existing.map(item => item.url));
            let addedCount = 0;
                        data.forEach(item => {
                            if (item && item.url && !existingUrls.has(item.url)) {
                existing.push(item);
            existingUrls.add(item.url);
            addedCount++;
                            }
                        });
            localStorage.setItem('myShortcuts', JSON.stringify(existing));
            renderShortcuts();
            alert(addedCount + ' 件のショートカットを追加（結合）しました。');
                    } else {
                alert('無効なファイル形式です。');
                    }
                } catch (err) {
                alert('ファイルの読み込みに失敗しました。');
                }
            e.target.value = ''; // リセットして再度同じファイルを選べるようにする
            };
            reader.readAsText(file);
        });

       
