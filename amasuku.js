'use strict';

// ============================================================================
// まさ検索 / amasuku.js : 機能別コード案内
// 01 URL・Steamの検証  02 名前／JSON処理  03 保存データの検証
// 04 Web起動           05 IndexedDB    06 HTMLフォルダー操作
// 07 HTMLプレビュー    08 URLファイル入力 09 左ランチャー描画
// 10 右ショートカット  11 JSON入出力     12 イベント・初期化
// ※ 実行処理は変更せず、見出しと各関数の説明コメントを追加。
// ============================================================================

// まさ検索: セキュリティ改修版
// 保存キーと画面のCSSクラスは従来のまま維持する。
// 保存先の名前と読込制限。既存のデータとの互換性のため保存キーは維持する。
const DB_NAME = 'MasaSearchDB';
const STORE_NAME = 'dirHandles';
const MAX_NAME_LENGTH = 160;
const MAX_URL_LENGTH = 4096;
const MAX_SHORTCUTS = 2000;
const MAX_IMPORT_SIZE = 2 * 1024 * 1024;
const MAX_URL_FILE_SIZE = 64 * 1024;

// HTMLフォルダーの復元状況と、現在選択中のファイル参照。
let isFolderRestored = false;
let gestureRestoreAttempted = false;
let htmlFolderHandleName = '';
let htmlFileHandles = Object.create(null);

// テーマの初期設定：保存値があれば優先、なければOSの設定を参照。
const savedTheme = localStorage.getItem('myTheme');
const initialTheme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', initialTheme);

// URLを作成する入口はここに統一する。javascript:、data:、file: 等は拒否。

// ============================================================================
// 01. URLの検証とSteam対応
// 登録・読み込みの両方で使う共通入口。危険な形式を許可しない。
// ============================================================================
/**
 * WebのURLを検証して正規化する。http/https以外、資格情報付きURL、制御文字を拒否する。
 *  * @param {string} input 入力されたURL
 *  * @param {boolean} allowMissingScheme スキーム省略時にhttpsを補うか
 *  * @returns {string|null} 使用可能なURL。無効ならnull
 */
function normalizeWebUrl(input, allowMissingScheme = false) {
    if (typeof input !== 'string') return null;
    let raw = input.trim();
    if (!raw || raw.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f\\\s]/.test(raw)) return null;
    if (allowMissingScheme && !/^[a-z][a-z\d+.-]*:/i.test(raw)) {
        // 擬似スキーム（見た目が似た文字を含む steam:// 等）もURLとして解釈しない。
        if (raw.includes('://')) return null;
        raw = 'https://' + raw;
    }
    try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        if (!parsed.hostname || parsed.username || parsed.password) return null;
        return parsed.href;
    } catch {
        return null;
    }
}

// Steamはアプリ起動とゲームIDの起動だけ許可（任意コマンドは禁止）。
// ゲームIDはSteamストアURLの /app/123456/ にある数字。
/**
 * ショートカット用URLを検証する。通常のWeb URLと限定したSteam起動URLだけを許可する。
 */
function normalizeShortcutUrl(input, allowMissingScheme = false) {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    if (raw === 'steam://open/main') return raw;
    const match = /^steam:\/\/(?:rungameid|run)\/([1-9][0-9]{0,9})$/i.exec(raw);
    if (match) return 'steam://rungameid/' + match[1];
    return normalizeWebUrl(raw, allowMissingScheme);
}

/**
 * URLから表示用の初期名称を作る。Steam本体／ゲームIDは専用名称にする。
 */
function shortcutDefaultName(url) {
    if (url === 'steam://open/main') return 'Steam';
    if (url.startsWith('steam://rungameid/')) return 'Steamゲーム ' + url.split('/').pop();
    return new URL(url).hostname;
}

/**
 * URLがSteam専用スキームか判定する。
 */
function isSteamShortcut(url) {
    return typeof url === 'string' && url.startsWith('steam://');
}

/**
 * リンク要素にhref等を設定する。Webリンクは別タブ表示、SteamはOSへ引き渡す。
 */
function prepareShortcutLink(anchor, url) {
    anchor.href = url;
    if (!isSteamShortcut(url)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    } else {
        // steam:// はユーザークリックでブラウザーから既存アプリに引き渡す。
        anchor.title = 'Steamアプリで開く（確認が表示される場合があります）';
    }
}


// ============================================================================
// 02. 名称整形・共通データ処理
// 表示文字列を整え、localStorageのJSON読込・保存を共通化する。
// ============================================================================
/**
 * ファイル名・登録名を表示用に整形する。不要な記号や拡張子を取り除く。
 */
function extractCleanName(rawName) {
    if (rawName === null || rawName === undefined) return '';
    let str = String(rawName);
    try { str = decodeURIComponent(str); } catch { /* 不正な%エンコードは原文を使う */ }
    str = str.replace(/<[^>]*>/g, '');
    str = str.replace(/(?:alt|title|src|href|class|id|style)\s*=\s*["'][^"']*["']/gi, '');
    str = str.replace(/(?:alt|title|src|href|class|id|style)\s*=\s*\S+/gi, '');
    if (str.includes('/') || str.includes('\\')) {
        const parts = str.split(/[/\\]/);
        str = parts[parts.length - 1];
    }
    str = str.split('?')[0].split('#')[0].split('=')[0];
    return str.replace(/["'<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').replace(/\.(html|htm|url|webloc|php|asp|jsp)$/i, '').trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * 値が配列ではないオブジェクトかどうかを判定する。
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 保存データが壊れていても画面を停止させず、復旧用の原文を残す。
/**
 * localStorageからJSONを読む。破損時は原文のバックアップを試み、既定値を返す。
 */
function readStoredJSON(key, fallback) {
    let raw;
    try { raw = localStorage.getItem(key); } catch (error) {
        console.warn('保存データを取得できません:', key, error);
        return fallback;
    }
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (error) {
        console.warn('保存データの形式が不正です:', key, error);
        try {
            const backupKey = key + '__invalid_backup';
            if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
        } catch { /* 保存容量不足でも画面動作は継続 */ }
        return fallback;
    }
}

/**
 * データをJSONとしてlocalStorageへ保存する。失敗時は警告を出してfalseを返す。
 */
function writeStoredJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error('保存処理に失敗:', key, error);
        alert('保存できませんでした。ブラウザーの保存容量・設定を確認してください。');
        return false;
    }
}


// ============================================================================
// 03. 保存済みショートカットの検証
// 一覧の読み込み時も一件ずつ内容を検証する。
// ============================================================================
/**
 * 読み込んだショートカット1件の名前とURLを検証・正規化する。
 */
function normalizeShortcut(item) {
    if (!isPlainObject(item)) return null;
    const url = normalizeShortcutUrl(item.url);
    if (!url) return null;
    const name = extractCleanName(item.name) || shortcutDefaultName(url);
    return {name, url};
}

/**
 * 右側ショートカットを読み、無効・重複データを除外して一覧を返す。保存キー：myShortcuts
 */
function readShortcuts() {
    const stored = readStoredJSON('myShortcuts', []);
    if (!Array.isArray(stored)) return [];
    const shortcuts = [];
    const seen = new Set();
    for (const item of stored) {
        const valid = normalizeShortcut(item);
        if (!valid || seen.has(valid.url)) continue;
        shortcuts.push(valid);
        seen.add(valid.url);
        if (shortcuts.length >= MAX_SHORTCUTS) break;
    }
    return shortcuts;
}

/**
 * 左ランチャー用URLフォルダーを読み、表示可能なツリーに整える。保存キー：myFolderFavoritesTree
 */
function readFolderTree() {
    const stored = readStoredJSON('myFolderFavoritesTree', {folders: {}});
    const folders = Object.create(null);
    if (!isPlainObject(stored) || !isPlainObject(stored.folders)) return {folders};
    let total = 0;
    for (const [rawName, rawItems] of Object.entries(stored.folders)) {
        if (!Array.isArray(rawItems)) continue;
        const folderName = extractCleanName(rawName) || 'URLリスト';
        if (!Object.hasOwn(folders, folderName)) folders[folderName] = [];
        const seen = new Set(folders[folderName].map(item => item.url));
        for (const item of rawItems) {
            const valid = normalizeShortcut(item);
            if (!valid || seen.has(valid.url)) continue;
            folders[folderName].push(valid);
            seen.add(valid.url);
            if (++total >= MAX_SHORTCUTS) return {folders};
        }
    }
    return {folders};
}

/**
 * 左ランチャーで固定中のフォルダー名を読み込む。保存キー：myPinnedFolders
 */
function readPinnedFolders() {
    const stored = readStoredJSON('myPinnedFolders', {});
    const pinned = Object.create(null);
    if (!isPlainObject(stored)) return pinned;
    for (const [key, value] of Object.entries(stored)) {
        if (value === true) pinned[key] = true;
    }
    return pinned;
}


// ============================================================================
// 04. Webページを開く
// 検索結果・翻訳結果を別タブで表示する。
// ============================================================================
/**
 * 検索や翻訳結果のWebページを別タブで開く。
 */
function openInBackground(url) {
    const safeUrl = normalizeWebUrl(url);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
}


// ============================================================================
// 05. IndexedDB：HTMLフォルダーの参照管理
// HTMLフォルダーの選択情報はlocalStorageではなくIndexedDBに保存する。
// ============================================================================
/**
 * IndexedDBを開く。HTMLフォルダーの参照ハンドルを保存するためのデータベース。
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 選択されたHTMLフォルダーの参照ハンドルをIndexedDBへ記録する。
 */
async function saveDirectoryHandle(handle) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, 'htmlFolder');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (error) { console.error('フォルダー保存エラー:', error); }
}

/**
 * 前回保存したHTMLフォルダーの参照ハンドルをIndexedDBから取得する。
 */
async function loadDirectoryHandle() {
    try {
        const db = await openDB();
        const result = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get('htmlFolder');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return result;
    } catch (error) { console.warn('フォルダー復元エラー:', error); return null; }
}

/**
 * 保存済みHTMLフォルダーの参照ハンドルをIndexedDBから削除する。
 */
async function removeDirectoryHandle() {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete('htmlFolder');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (error) { console.warn('フォルダー削除エラー:', error); }
}


// ============================================================================
// 06. HTMLフォルダーの選択・権限復元
// ページ開始時の自動復元とユーザー操作による再許可を管理する。
// ============================================================================
/**
 * フォルダーへのアクセス許可を再取得するボタンの表示を切り替える。
 */
function showRestoreButton(visible) {
    document.getElementById('restore-folder-btn').hidden = !visible;
}

/**
 * ページ開始時、既に許可済みならHTMLフォルダーを自動復元する。
 */
async function attemptSilentRestore() {
    const handle = await loadDirectoryHandle();
    if (!handle) return;
    try {
        if (await handle.queryPermission({mode: 'read'}) === 'granted') {
            await processDirectoryHandle(handle);
            isFolderRestored = true;
        } else showRestoreButton(true);
    } catch (error) { console.warn('自動復元エラー:', error); showRestoreButton(true); }
}

/**
 * クリックやキー入力をきっかけに、フォルダーの再許可・復元を試みる。
 */
async function attemptGestureRestore() {
    if (isFolderRestored || gestureRestoreAttempted) return;
    const handle = await loadDirectoryHandle();
    if (!handle) return;
    gestureRestoreAttempted = true;
    try {
        const options = {mode: 'read'};
        if ((await handle.queryPermission(options)) !== 'granted') {
            if (await handle.requestPermission(options) !== 'granted') return;
        }
        await processDirectoryHandle(handle);
        isFolderRestored = true;
        showRestoreButton(false);
    } catch (error) { console.warn('復元エラー:', error); }
}

/**
 * 「フォルダーを許可して復元」ボタンから復元処理を呼び出す。
 */
async function forceRestoreHtmlFolder() {
    gestureRestoreAttempted = false;
    await attemptGestureRestore();
}

/**
 * フォルダー直下のHTML/HTMファイルを集め、左ランチャーへ表示する。
 */
async function processDirectoryHandle(directory) {
    const handles = Object.create(null);
    for await (const entry of directory.values()) {
        if (entry.kind !== 'file' || !/\.html?$/i.test(entry.name)) continue;
        handles[entry.name] = entry;
    }
    htmlFolderHandleName = directory.name;
    htmlFileHandles = handles;
    renderFavorites();
    if (Object.keys(handles).length === 0) alert('HTMLファイルが見つかりませんでした。');
}

/**
 * フォルダー選択ダイアログを開き、選択結果を記録して一覧を更新する。
 */
async function selectHtmlFolder() {
    try {
        const directory = await window.showDirectoryPicker({id: 'masaHtmlFolderPicker'});
        await saveDirectoryHandle(directory);
        await processDirectoryHandle(directory);
        isFolderRestored = true;
        showRestoreButton(false);
    } catch (error) {
        if (error.name !== 'AbortError') console.warn('フォルダー選択に失敗:', error);
    }
}

// 選択したHTMLをサンドボックス内で開く。元サイトのlocalStorageやIndexedDBには触れさせない。
// JSはiframe内で動作するが、blob:のため元ファイル相対パスの参照には制約がある。

// ============================================================================
// 07. ローカルHTMLの隔離プレビュー
// 選択ファイルをsandbox付きiframeで開く。
// ============================================================================
/**
 * 選択HTMLを別タブのsandbox付きiframeでプレビューする。
 *  * JavaScriptは隔離されたiframe内で動作する。相対ファイル参照には制限がある。
 */
async function openHTML(entry) {
    // クリック直後に空タブを作り、ポップアップブロックを避ける。
    const tab = window.open('about:blank', '_blank');
    if (!tab) { alert('新しいタブを開けませんでした。'); return; }
    tab.opener = null;
    try {
        const file = await entry.getFile();
        const blobUrl = URL.createObjectURL(file);
        const doc = tab.document;
        doc.title = 'HTMLプレビュー（隔離表示）';
        doc.body.style.margin = '0';
        const frame = doc.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.setAttribute('title', '隔離されたHTMLプレビュー');
        frame.style.cssText = 'display:block;width:100vw;height:100vh;border:0;';
        frame.src = blobUrl;
        doc.body.appendChild(frame);
        // 初期ロード完了後にURLを破棄し、オブジェクトURLの滞留を抑制する。
        frame.addEventListener('load', () => {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
        }, {once: true});
        frame.addEventListener('error', () => URL.revokeObjectURL(blobUrl), {once: true});
    } catch (error) {
        console.error('HTMLを開けませんでした:', error);
        tab.close();
        alert('ファイルを開けませんでした。');
    }
}


// ============================================================================
// 08. URLファイルのインポート
// .url / .weblocファイルを解析し、フォルダー単位で登録する。
// ============================================================================
/**
 * .url / .weblocファイルからURLを取り出し、安全なショートカットURLだけ返す。
 */
function parseUrlFile(text, extension) {
    let candidate = '';
    if (extension === '.url') {
        candidate = text.match(/^URL\s*=\s*(.*?)\s*$/im)?.[1] || '';
    } else {
        candidate = text.match(/<string>\s*([^<]+?)\s*<\/string>/i)?.[1] || '';
        candidate = candidate.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }
    return normalizeShortcutUrl(candidate);
}

/**
 * フォルダーからURLファイルを読み、重複を除いて左ランチャーへ登録する。
 */
async function importUrlFolder(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const tree = readFolderTree();
    let added = 0;
    let ignored = 0;
    let total = Object.values(tree.folders).reduce((sum, list) => sum + list.length, 0);
    for (const file of files) {
        if (total >= MAX_SHORTCUTS) { ignored++; continue; }
        const extension = file.name.toLowerCase().endsWith('.webloc') ? '.webloc'
            : file.name.toLowerCase().endsWith('.url') ? '.url' : null;
        if (!extension) continue;
        if (file.size > MAX_URL_FILE_SIZE) { ignored++; continue; }
        try {
            const url = parseUrlFile(await file.text(), extension);
            if (!url) { ignored++; continue; }
            const pathParts = (file.webkitRelativePath || file.name).split('/');
            const folderName = pathParts.length >= 2
                ? extractCleanName(pathParts[pathParts.length - 2]) || 'URLリスト'
                : 'URLリスト';
            if (!Object.hasOwn(tree.folders, folderName)) tree.folders[folderName] = [];
            if (tree.folders[folderName].some(item => item.url === url)) continue;
            tree.folders[folderName].push({name: extractCleanName(file.name) || shortcutDefaultName(url), url});
            added++;
            total++;
        } catch (error) { console.warn('URLファイルの解析に失敗:', file.name, error); ignored++; }
    }
    if (added && writeStoredJSON('myFolderFavoritesTree', tree)) {
        renderFavorites();
        alert(`${added} 件のURLショートカットを追加しました。` + (ignored ? `\n無効なファイル等 ${ignored} 件を除外しました。` : ''));
    } else if (!added) {
        alert('追加可能なURLショートカットはありませんでした。' + (ignored ? `\n無効なファイル等 ${ignored} 件を除外しました。` : ''));
    }
    event.target.value = '';
}


// ============================================================================
// 09. 左ランチャーの画面生成
// フォルダー、固定ピン、サイトアイコン、ファイルのリンクを描画する。
// ============================================================================
/**
 * 左ランチャーのフォルダー見出しとピン固定ボタンを作成する。
 */
function createFolderHeader(titleText, column) {
    const header = document.createElement('div');
    header.className = 'folder-title';
    const inner = document.createElement('div');
    inner.className = 'folder-title-inner';
    const label = document.createElement('span');
    label.append(document.createTextNode('📁 '));
    const title = document.createElement('span');
    title.className = 'title-text';
    title.textContent = titleText; // 文字列をHTMLとして解釈しない（XSS対策）
    label.appendChild(title);
    const pinButton = document.createElement('button');
    pinButton.type = 'button';
    pinButton.className = 'pin-btn';
    pinButton.title = 'フォルダーを固定 / 解除';
    const pinned = readPinnedFolders();
    if (Object.hasOwn(pinned, titleText)) {
        pinButton.textContent = '📌';
        column.classList.add('pinned');
    } else pinButton.textContent = '📍';
    pinButton.addEventListener('click', event => {
        event.stopPropagation();
        const next = readPinnedFolders();
        if (column.classList.contains('pinned')) {
            column.classList.remove('pinned');
            delete next[titleText];
            pinButton.textContent = '📍';
        } else {
            column.classList.add('pinned');
            next[titleText] = true;
            pinButton.textContent = '📌';
        }
        writeStoredJSON('myPinnedFolders', next);
    });
    inner.append(label, pinButton);
    header.appendChild(inner);
    return header;
}

/**
 * URLに応じたアイコンを作る。Steamはゲーム絵文字、Webはドメインのfavicon。
 */
function makeIcon(url, size) {
    const holder = document.createElement('div');
    holder.className = size === 32 ? 'icon-wrapper' : 'shortcut-icon';
    if (isSteamShortcut(url)) {
        holder.textContent = '🎮';
        holder.setAttribute('aria-hidden', 'true');
        return holder;
    }
    const img = document.createElement('img');
    img.alt = '';
    const hostname = new URL(url).hostname;
    // 検索パラメーターや個人情報を外部のfaviconサービスに送らない。
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
    img.addEventListener('error', () => { img.hidden = true; }, {once: true});
    holder.appendChild(img);
    return holder;
}

/**
 * HTMLファイルとURLフォルダーをもとに左ランチャーのDOMを再生成する。
 */
function renderFavorites() {
    const content = document.getElementById('launcher-content');
    content.replaceChildren();
    let count = 0;
    if (Object.keys(htmlFileHandles).length > 0) {
        count++;
        const col = document.createElement('div');
        col.className = 'folder-col';
        col.appendChild(createFolderHeader(extractCleanName(htmlFolderHandleName), col));
        for (const [name, entry] of Object.entries(htmlFileHandles)) {
            const a = document.createElement('a');
            a.className = 'dock-btn html-file-link';
            a.href = '#';
            a.addEventListener('click', event => { event.preventDefault(); openHTML(entry); });
            const wrapper = document.createElement('div');
            wrapper.className = 'icon-wrapper';
            const img = document.createElement('img');
            img.alt = '';
            img.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239aa0a6"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>';
            wrapper.appendChild(img);
            const span = document.createElement('span');
            span.className = 'text';
            span.textContent = extractCleanName(name);
            a.append(wrapper, span);
            col.appendChild(a);
        }
        content.appendChild(col);
    }
    const tree = readFolderTree();
    for (const [folderName, items] of Object.entries(tree.folders)) {
        if (!items.length) continue;
        count++;
        const col = document.createElement('div');
        col.className = 'folder-col';
        col.appendChild(createFolderHeader(extractCleanName(folderName), col));
        for (const favorite of items) {
            const a = document.createElement('a');
            a.className = 'dock-btn';
            prepareShortcutLink(a, favorite.url);
            const span = document.createElement('span');
            span.className = 'text';
            span.textContent = extractCleanName(favorite.name);
            a.append(makeIcon(favorite.url, 32), span);
            col.appendChild(a);
        }
        content.appendChild(col);
    }
    if (!count) {
        const col = document.createElement('div');
        col.className = 'folder-col';
        const label = document.createElement('div');
        label.className = 'folder-title';
        label.textContent = '📁';
        col.appendChild(label);
        content.appendChild(col);
    }
}

/**
 * 左ランチャーのURL一覧とHTMLフォルダー参照を消去する。確認画面付き。
 */
function clearFavorites() {
    if (!confirm('左側に読み込んだリストをすべて消去してリセットしますか？\n（※HTMLフォルダの保存情報もクリアされます）')) return;
    localStorage.removeItem('myFolderFavoritesTree');
    htmlFileHandles = Object.create(null);
    htmlFolderHandleName = '';
    isFolderRestored = false;
    gestureRestoreAttempted = true;
    void removeDirectoryHandle();
    showRestoreButton(false);
    renderFavorites();
}


// ============================================================================
// 10. 右ショートカットの表示・編集
// 表示／上下移動／削除／新規追加を担当する。
// ============================================================================
/**
 * 右ショートカットのDOMと「上へ／下へ／削除」操作を生成する。
 */
function renderShortcuts() {
    const container = document.getElementById('shortcut-list');
    container.replaceChildren();
    const shortcuts = readShortcuts();
    shortcuts.forEach((sc, index) => {
        const a = document.createElement('a');
        a.className = 'shortcut';
        prepareShortcutLink(a, sc.url);
        const span = document.createElement('span');
        span.className = 'text';
        span.textContent = sc.name;
        const controls = document.createElement('div');
        controls.className = 'shortcut-controls';
        for (const [label, title, className, action] of [
            ['▲', '上へ移動', 'ctrl-btn' + (index === 0 ? ' disabled' : ''), event => moveShortcut(event, index, -1)],
            ['▼', '下へ移動', 'ctrl-btn' + (index === shortcuts.length - 1 ? ' disabled' : ''), event => moveShortcut(event, index, 1)],
            ['×', '削除', 'ctrl-btn del-btn', event => deleteShortcut(event, index)]
        ]) {
            const button = document.createElement('div');
            button.className = className;
            button.textContent = label;
            button.title = title;
            button.addEventListener('click', action);
            controls.appendChild(button);
        }
        a.append(makeIcon(sc.url, 64), span, controls);
        container.appendChild(a);
    });
}

/**
 * 右ショートカットの表示順を上下に移動し、localStorageへ保存する。
 */
function moveShortcut(event, index, direction) {
    event.preventDefault();
    event.stopPropagation();
    const shortcuts = readShortcuts();
    const target = index + direction;
    if (target < 0 || target >= shortcuts.length) return;
    const item = shortcuts.splice(index, 1)[0];
    shortcuts.splice(target, 0, item);
    if (writeStoredJSON('myShortcuts', shortcuts)) renderShortcuts();
}

/**
 * 指定された右ショートカットを、確認後に一覧から削除する。
 */
function deleteShortcut(event, index) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm('このショートカットを削除しますか？')) return;
    const shortcuts = readShortcuts();
    shortcuts.splice(index, 1);
    if (writeStoredJSON('myShortcuts', shortcuts)) renderShortcuts();
}

/**
 * 名前・URLの入力ダイアログで右ショートカットを追加する。Steamゲームにも対応。
 */
function addShortcut() {
    const name = prompt('ショートカットの名前を入力:\n（例: Yahoo!ニュース）');
    if (!name) return;
    const rawUrl = prompt('URLを入力:\n（例: https://news.yahoo.co.jp）\nSteamゲーム: steam://rungameid/123456\nSteam本体: steam://open/main');
    if (!rawUrl) return;
    const url = normalizeShortcutUrl(rawUrl, true);
    if (!url) { alert('URLが無効です。http(s) URL、または指定形式のSteam起動URLのみ使用できます。'); return; }
    const shortcuts = readShortcuts();
    if (shortcuts.length >= MAX_SHORTCUTS) { alert('登録数の上限に達しました。'); return; }
    if (shortcuts.some(item => item.url === url)) { alert('同じURLは登録済みです。'); return; }
    shortcuts.push({name: extractCleanName(name) || shortcutDefaultName(url), url});
    if (writeStoredJSON('myShortcuts', shortcuts)) renderShortcuts();
}


// ============================================================================
// 11. 右ショートカットのバックアップ・復元
// JSONでの書き出し、JSONからの読み込みを管理する。
// ============================================================================
/**
 * 右ショートカット一覧を shortcuts.json として書き出す。
 */
function exportShortcuts() {
    const data = JSON.stringify(readShortcuts(), null, 2);
    const url = URL.createObjectURL(new Blob([data], {type: 'application/json;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shortcuts.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * JSONファイルを読み込み、検証・重複除外して右ショートカットへ結合する。
 */
async function importShortcuts(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        if (file.size > MAX_IMPORT_SIZE) throw new Error('ファイルが大きすぎます。');
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data)) throw new Error('JSON配列ではありません。');
        const shortcuts = readShortcuts();
        const existing = new Set(shortcuts.map(item => item.url));
        let added = 0;
        let rejected = 0;
        for (const item of data) {
            if (shortcuts.length >= MAX_SHORTCUTS) { rejected++; continue; }
            const valid = normalizeShortcut(item);
            if (!valid) { rejected++; continue; }
            if (existing.has(valid.url)) continue;
            shortcuts.push(valid);
            existing.add(valid.url);
            added++;
        }
        if (writeStoredJSON('myShortcuts', shortcuts)) {
            renderShortcuts();
            alert(`${added} 件のショートカットを追加（結合）しました。` + (rejected ? `\n不正なデータ等 ${rejected} 件を除外しました。` : ''));
        }
    } catch (error) {
        console.warn('読込エラー:', error);
        alert('ファイルの読み込みに失敗しました。JSON形式・サイズを確認してください。');
    } finally { event.target.value = ''; }
}


// ============================================================================
// 12. イベント登録・画面の初期化
// この部分がHTMLのボタンやフォームと各関数を結び付ける。
// ============================================================================
document.addEventListener('click', attemptGestureRestore);
document.addEventListener('keydown', attemptGestureRestore);
// DOMの構築完了後にフォーム・ボタンのイベントを設定し、一覧を描画する。
// HTML要素のidを変更した場合は、ここにあるgetElementByIdも合わせて変更する。
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('search-form').addEventListener('submit', event => {
        event.preventDefault();
        const query = event.currentTarget.elements.namedItem('q').value;
        if (query) openInBackground('https://www.google.com/search?q=' + encodeURIComponent(query));
    });
    document.getElementById('translate-form').addEventListener('submit', event => {
        event.preventDefault();
        const phrase = event.currentTarget.elements.namedItem('text').value;
        if (phrase) openInBackground('https://translate.google.co.jp/?sl=auto&tl=ja&text=' + encodeURIComponent(phrase) + '&op=translate');
    });
    document.getElementById('select-html-folder-btn').addEventListener('click', selectHtmlFolder);
    document.getElementById('restore-folder-btn').addEventListener('click', forceRestoreHtmlFolder);
    document.getElementById('url-folder-input').addEventListener('change', importUrlFolder);
    document.getElementById('add-url-btn').addEventListener('click', () => document.getElementById('url-folder-input').click());
    document.getElementById('clear-favorites-btn').addEventListener('click', clearFavorites);
    document.getElementById('save-shortcuts-btn').addEventListener('click', exportShortcuts);
    document.getElementById('load-shortcuts-btn').addEventListener('click', () => document.getElementById('import-shortcuts-input').click());
    document.getElementById('import-shortcuts-input').addEventListener('change', importShortcuts);
    document.getElementById('add-shortcut-btn').addEventListener('click', addShortcut);
    const themeButton = document.getElementById('theme-toggle');
    themeButton.textContent = initialTheme === 'dark' ? '☀️' : '🌙';
    themeButton.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('myTheme', next);
        themeButton.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    renderFavorites();
    renderShortcuts();
    await attemptSilentRestore();
});
