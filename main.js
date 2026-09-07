const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

let mainWindow;
let git = null;
let repoPath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#1a1b1e',
    title: 'Git Commit App',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function setRepo(p) {
  repoPath = p;
  git = simpleGit(p);
}

function requireGit() {
  if (!git) throw new Error('リポジトリが選択されていません');
  return git;
}

ipcMain.handle('get-repo-path', () => repoPath);

ipcMain.handle('open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Gitリポジトリのディレクトリを選択',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  const check = simpleGit(dir);
  const isRepo = await check.checkIsRepo().catch(() => false);
  if (!isRepo) {
    return { error: '選択したフォルダはGitリポジトリではありません' };
  }
  setRepo(dir);
  return { path: dir };
});

ipcMain.handle('choose-clone-parent', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'クローン先の親ディレクトリを選択',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

ipcMain.handle('clone-repo', async (event, url, destParent) => {
  try {
    const name = url.split('/').pop().replace(/\.git$/, '') || 'repository';
    const dest = path.join(destParent, name);
    // GIT_TERMINAL_PROMPT=0 で認証プロンプトを無効化し、
    // 認証が必要なリポジトリの場合は待機せず即エラーにする。
    // process.env全体は渡さず、必要な変数だけ追加する
    // （$EDITOR等を渡すとsimple-gitの安全チェックに引っかかるため）
    const tempGit = simpleGit().env('GIT_TERMINAL_PROMPT', '0');
    await withTimeout(
      tempGit.clone(url, dest),
      30000,
      'タイムアウトしました。認証が必要なリポジトリの可能性があります（SSH URLを使うか、事前にgit credentialを設定してください）'
    );
    setRepo(dest);
    return { success: true, path: dest };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-status', async () => {
  if (!git) return { error: 'not-selected' };
  try {
    const status = await git.status();
    const branchSummary = await git.branch();
    // simple-gitのStatusResultはisClean()等の関数を含むクラスインスタンスで、
    // そのままだとElectronのIPC（構造化クローン）でシリアライズに失敗し、
    // 呼び出し側で例外になって何も表示されなくなる。プレーンオブジェクトに詰め替える。
    return {
      branch: branchSummary.current,
      status: {
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        created: status.created,
        deleted: status.deleted,
        conflicted: status.conflicted,
        renamed: status.renamed,
      },
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('git-stage', async (event, files) => {
  try {
    const g = requireGit();
    if (files === 'all') await g.add('.');
    else await g.add(files);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-unstage', async (event, files) => {
  try {
    const g = requireGit();
    if (files === 'all') await g.reset(['HEAD']);
    else await g.reset(['HEAD', '--', ...files]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-commit', async (event, message) => {
  try {
    const g = requireGit();
    const result = await g.commit(message);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-push', async () => {
  try {
    const g = requireGit();
    await g.push();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-pull', async () => {
  try {
    const g = requireGit();
    await g.pull();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git-log', async () => {
  try {
    const g = requireGit();
    const log = await g.log({ maxCount: 40 });
    return log.all;
  } catch (err) {
    return [];
  }
});

// category: 'staged' | 'untracked' | 'unstaged'
ipcMain.handle('git-diff', async (event, filePath, category) => {
  try {
    requireGit();
    if (category === 'untracked') {
      const fullPath = path.join(repoPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      return { diff: content, mode: 'raw' };
    }
    const args = category === 'staged' ? ['--cached', '--', filePath] : ['--', filePath];
    const diff = await git.diff(args);
    return { diff, mode: 'diff' };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// 日本語→英語 自動翻訳（Google翻訳の無料エンドポイントを利用）
ipcMain.handle('translate-text', async (event, text) => {
  const hasJapanese = /[\u3040-\u30ff\u30a0-\u30ff\u3400-\u9fff]/.test(text);
  if (!hasJapanese) {
    return { translated: text, skipped: true };
  }
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`翻訳API応答エラー: ${res.status}`);
    const data = await res.json();
    const translated = data[0].map((chunk) => chunk[0]).join('');
    return { translated, skipped: false };
  } catch (err) {
    return { translated: text, skipped: true, error: err.message };
  }
});
