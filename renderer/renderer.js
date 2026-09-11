let selectedPrefix = null;
let prefixChosen = false;
let repoActive = false;
let translationPending = false;
let translatedCache = { raw: '', translated: '' };
let currentFiles = []; // { path, status, staged }

const els = {
  repoPath: document.getElementById('repoPath'),
  branchBadge: document.getElementById('branchBadge'),
  btnOpen: document.getElementById('btnOpen'),
  btnClone: document.getElementById('btnClone'),
  btnPull: document.getElementById('btnPull'),
  btnPush: document.getElementById('btnPush'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnOpenInExplorer: document.getElementById('btnOpenInExplorer'),
  fileList: document.getElementById('fileList'),
  btnStageAll: document.getElementById('btnStageAll'),
  prefixRow: document.getElementById('prefixRow'),
  commitMessage: document.getElementById('commitMessage'),
  previewText: document.getElementById('previewText'),
  autoTranslate: document.getElementById('autoTranslate'),
  btnCommit: document.getElementById('btnCommit'),
  commitStatus: document.getElementById('commitStatus'),
  commitLog: document.getElementById('commitLog'),
  cloneModal: document.getElementById('cloneModal'),
  cloneUrl: document.getElementById('cloneUrl'),
  cloneDest: document.getElementById('cloneDest'),
  btnChooseDest: document.getElementById('btnChooseDest'),
  btnCloneCancel: document.getElementById('btnCloneCancel'),
  btnCloneConfirm: document.getElementById('btnCloneConfirm'),
  cloneStatus: document.getElementById('cloneStatus'),
  diffModal: document.getElementById('diffModal'),
  diffFileName: document.getElementById('diffFileName'),
  diffBody: document.getElementById('diffBody'),
  btnDiffClose: document.getElementById('btnDiffClose'),
};

function setStatusLine(el, text, kind) {
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}

function setRepoActive(active) {
  repoActive = active;
  els.btnPull.disabled = !active;
  els.btnPush.disabled = !active;
  els.btnRefresh.disabled = !active;
  els.btnStageAll.disabled = !active;
  els.btnOpenInExplorer.disabled = !active;
  updateCommitButtonState();
  if (!active) updateSyncButtons(0, 0);
}

function updateCommitButtonState() {
  els.btnCommit.disabled = !repoActive || !prefixChosen;
}

function updateSyncButtons(ahead, behind) {
  els.btnPush.classList.toggle('btn-highlight', ahead > 0);
  els.btnPush.textContent = ahead > 0 ? `プッシュ (${ahead})` : 'プッシュ';
  els.btnPull.classList.toggle('btn-highlight', behind > 0);
  els.btnPull.textContent = behind > 0 ? `プル (${behind})` : 'プル';
}

async function refreshAll() {
  const path = await window.gitAPI.getRepoPath();
  if (!path) return;
  await refreshStatus();
  await refreshLog();
}

async function refreshStatus() {
  let res;
  try {
    res = await window.gitAPI.getStatus();
  } catch (err) {
    setStatusLine(els.commitStatus, `ステータス取得に失敗しました: ${err.message}`, 'err');
    return;
  }
  if (!res || res.error) {
    if (res && res.error) {
      setStatusLine(els.commitStatus, `ステータス取得に失敗しました: ${res.error}`, 'err');
    }
    return;
  }
  els.branchBadge.hidden = false;
  els.branchBadge.textContent = res.branch || '-';

  updateSyncButtons(res.status.ahead || 0, res.status.behind || 0);

  const s = res.status;
  currentFiles = [];

  s.staged.forEach((f) => currentFiles.push({ path: f, staged: true, status: statusCharFor(s, f), untracked: false }));
  const unstagedPaths = new Set([...s.modified, ...s.not_added, ...s.deleted, ...s.created]);
  s.staged.forEach((f) => unstagedPaths.delete(f));
  unstagedPaths.forEach((f) => currentFiles.push({ path: f, staged: false, status: statusCharFor(s, f), untracked: s.not_added.includes(f) }));

  renderFileList();
}

function statusCharFor(s, file) {
  if (s.created.includes(file) || s.not_added.includes(file)) return 'A';
  if (s.deleted.includes(file)) return 'D';
  if (s.modified.includes(file)) return 'M';
  return 'U';
}

function renderFileList() {
  els.fileList.innerHTML = '';
  if (currentFiles.length === 0) {
    els.fileList.innerHTML = '<p class="empty-hint">変更されたファイルはありません</p>';
    return;
  }
  currentFiles.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'file-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = f.staged;
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked) {
        await window.gitAPI.stageFiles([f.path]);
      } else {
        await window.gitAPI.unstageFiles([f.path]);
      }
      await refreshStatus();
    });

    const statusSpan = document.createElement('span');
    statusSpan.className = `file-status status-${f.status}`;
    statusSpan.textContent = f.status;

    const pathSpan = document.createElement('span');
    pathSpan.className = 'file-path clickable';
    pathSpan.textContent = f.path;
    pathSpan.title = 'クリックしてdiffを表示';
    pathSpan.addEventListener('click', () => openDiff(f));

    row.appendChild(checkbox);
    row.appendChild(statusSpan);
    row.appendChild(pathSpan);
    els.fileList.appendChild(row);
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function classifyDiffLine(line) {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('diff --git') || line.startsWith('index ')) return 'meta';
  return 'context';
}

function renderDiffText(text, mode) {
  if (!text) {
    return '<p class="empty-hint">差分はありません</p>';
  }
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const cls = mode === 'raw' ? 'context' : classifyDiffLine(line);
      return `<div class="diff-line ${cls}">${escapeHtml(line) || '&nbsp;'}</div>`;
    })
    .join('');
}

async function openDiff(file) {
  const category = file.staged ? 'staged' : file.untracked ? 'untracked' : 'unstaged';
  els.diffFileName.textContent = file.path;
  els.diffBody.innerHTML = '<p class="empty-hint">読み込み中...</p>';
  els.diffModal.hidden = false;
  try {
    const res = await window.gitAPI.getDiff(file.path, category);
    if (res.error) {
      els.diffBody.innerHTML = `<p class="empty-hint">取得に失敗しました: ${escapeHtml(res.error)}</p>`;
      return;
    }
    els.diffBody.innerHTML = renderDiffText(res.diff, res.mode);
  } catch (err) {
    els.diffBody.innerHTML = `<p class="empty-hint">取得に失敗しました: ${escapeHtml(err.message)}</p>`;
  }
}

function closeDiffModal() {
  els.diffModal.hidden = true;
}

els.btnDiffClose.addEventListener('click', closeDiffModal);
els.diffModal.addEventListener('click', (e) => {
  if (e.target === els.diffModal) closeDiffModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.diffModal.hidden) closeDiffModal();
});

async function refreshLog() {
  const log = await window.gitAPI.getLog();
  els.commitLog.innerHTML = '';
  if (!log || log.length === 0) {
    els.commitLog.innerHTML = '<p class="empty-hint">まだ表示するコミットがありません</p>';
    return;
  }
  log.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'commit-entry';
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = entry.message;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = new Date(entry.date);
    meta.textContent = `${entry.hash.slice(0, 7)} · ${entry.author_name} · ${date.toLocaleString('ja-JP')}`;
    div.appendChild(msg);
    div.appendChild(meta);
    els.commitLog.appendChild(div);
  });
}

let previewTimer = null;
let previewToken = 0;

function updatePreview() {
  const raw = els.commitMessage.value.trim();
  const prefixPart = selectedPrefix ? `${selectedPrefix}: ` : '';

  clearTimeout(previewTimer);
  previewToken += 1;

  if (!raw) {
    els.previewText.textContent = '-';
    translationPending = false;
    updateCommitButtonState();
    return;
  }

  const hasJapanese = /[\u3040-\u30ff\u30a0-\u30ff\u3400-\u9fff]/.test(raw);

  if (!els.autoTranslate.checked || !hasJapanese) {
    els.previewText.textContent = `${prefixPart}${raw}`;
    translatedCache = { raw, translated: raw };
    translationPending = false;
    updateCommitButtonState();
    return;
  }

  // 翻訳が確定するまではコミットさせない
  translationPending = true;
  updateCommitButtonState();
  els.previewText.textContent = `${prefixPart}(翻訳中...)`;

  const myToken = previewToken;
  previewTimer = setTimeout(async () => {
    const t = await window.gitAPI.translate(raw);
    if (myToken !== previewToken) return; // 入力が変わっていたら古い結果は捨てる
    translatedCache = { raw, translated: t.translated };
    translationPending = false;
    updateCommitButtonState();
    els.previewText.textContent = `${prefixPart}${t.translated}`;
  }, 500);
}

// --- イベント登録 ---

els.btnOpen.addEventListener('click', async () => {
  const res = await window.gitAPI.openDirectory();
  if (!res) return;
  if (res.error) {
    alert(res.error);
    return;
  }
  els.repoPath.textContent = res.path;
  setRepoActive(true);
  await refreshAll();
});

els.btnClone.addEventListener('click', () => {
  els.cloneModal.hidden = false;
  els.cloneUrl.value = '';
  els.cloneDest.value = '';
  setStatusLine(els.cloneStatus, '');
});

function closeCloneModal() {
  els.cloneModal.hidden = true;
  els.btnCloneConfirm.disabled = false;
}

els.btnCloneCancel.addEventListener('click', closeCloneModal);

// 背景（オーバーレイ部分）をクリックしても閉じる
els.cloneModal.addEventListener('click', (e) => {
  if (e.target === els.cloneModal) closeCloneModal();
});

// Escapeキーでも閉じる
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.cloneModal.hidden) closeCloneModal();
});

els.btnChooseDest.addEventListener('click', async () => {
  const dir = await window.gitAPI.chooseCloneParent();
  if (dir) els.cloneDest.value = dir;
});

els.btnCloneConfirm.addEventListener('click', async () => {
  const url = els.cloneUrl.value.trim();
  const dest = els.cloneDest.value.trim();
  if (!url || !dest) {
    setStatusLine(els.cloneStatus, 'URLと保存先の両方を指定してください', 'err');
    return;
  }
  setStatusLine(els.cloneStatus, 'クローン中...');
  els.btnCloneConfirm.disabled = true;
  try {
    const res = await window.gitAPI.cloneRepo(url, dest);
    if (res.success) {
      setStatusLine(els.cloneStatus, '完了しました', 'ok');
      els.repoPath.textContent = res.path;
      setRepoActive(true);
      els.cloneModal.hidden = true;
      await refreshAll();
    } else {
      setStatusLine(els.cloneStatus, `失敗: ${res.error}`, 'err');
    }
  } catch (err) {
    setStatusLine(els.cloneStatus, `失敗: ${err.message}`, 'err');
  } finally {
    els.btnCloneConfirm.disabled = false;
  }
});

els.btnRefresh.addEventListener('click', refreshAll);

els.btnOpenInExplorer.addEventListener('click', async () => {
  const res = await window.gitAPI.openRepoFolder();
  if (!res.success) {
    setStatusLine(els.commitStatus, `フォルダを開けませんでした: ${res.error}`, 'err');
  }
});

els.btnStageAll.addEventListener('click', async () => {
  await window.gitAPI.stageFiles('all');
  await refreshStatus();
});

els.btnPull.addEventListener('click', async () => {
  setStatusLine(els.commitStatus, 'プル中...');
  const res = await window.gitAPI.pull();
  if (res.success) {
    setStatusLine(els.commitStatus, 'プルしました', 'ok');
    await refreshAll();
  } else {
    setStatusLine(els.commitStatus, `失敗: ${res.error}`, 'err');
  }
});

els.btnPush.addEventListener('click', async () => {
  setStatusLine(els.commitStatus, 'プッシュ中...');
  const res = await window.gitAPI.push();
  if (res.success) {
    setStatusLine(els.commitStatus, 'プッシュしました', 'ok');
    await refreshStatus();
  } else {
    setStatusLine(els.commitStatus, `失敗: ${res.error}`, 'err');
  }
});

els.prefixRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.prefix-btn');
  if (!btn) return;
  const prefix = btn.dataset.prefix;
  // none も含めて必ずどれか1つを選ぶ方式（選択解除はできない）
  selectedPrefix = prefix === 'none' ? null : prefix;
  prefixChosen = true;
  [...els.prefixRow.children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  updateCommitButtonState();
  updatePreview();
});

els.commitMessage.addEventListener('input', updatePreview);
els.autoTranslate.addEventListener('change', updatePreview);

els.btnCommit.addEventListener('click', async () => {
  const raw = els.commitMessage.value.trim();
  if (!raw) {
    setStatusLine(els.commitStatus, 'コミットメッセージを入力してください', 'err');
    return;
  }
  els.btnCommit.disabled = true;
  setStatusLine(els.commitStatus, '処理中...');

  // プレビューで確定済みの翻訳結果があればそれを使う。
  // まだ翻訳中/未確定の場合はボタン操作は止めず、ここで即座に翻訳して
  // 完了を待ってからコミットする（デバウンス待ちはスキップする）
  let finalMessage = raw;
  if (els.autoTranslate.checked) {
    const hasJapanese = /[\u3040-\u30ff\u30a0-\u30ff\u3400-\u9fff]/.test(raw);
    if (hasJapanese) {
      if (translatedCache.raw === raw) {
        finalMessage = translatedCache.translated;
      } else {
        clearTimeout(previewTimer);
        previewToken += 1;
        setStatusLine(els.commitStatus, '翻訳中...');
        const t = await window.gitAPI.translate(raw);
        translatedCache = { raw, translated: t.translated };
        translationPending = false;
        finalMessage = t.translated;
      }
    }
  }
  if (selectedPrefix) {
    finalMessage = `${selectedPrefix}: ${finalMessage}`;
  }

  // ステージ済みファイルがなければ全て自動ステージ
  const hasStaged = currentFiles.some((f) => f.staged);
  if (!hasStaged && currentFiles.length > 0) {
    await window.gitAPI.stageFiles('all');
  }

  const res = await window.gitAPI.commit(finalMessage);

  if (res.success) {
    setStatusLine(els.commitStatus, `コミットしました: ${finalMessage}`, 'ok');
    els.commitMessage.value = '';
    selectedPrefix = null;
    prefixChosen = false;
    translatedCache = { raw: '', translated: '' };
    [...els.prefixRow.children].forEach((b) => b.classList.remove('active'));
    updateCommitButtonState();
    updatePreview();
    await refreshAll();
  } else {
    updateCommitButtonState();
    setStatusLine(els.commitStatus, `失敗: ${res.error}`, 'err');
  }
});

// 初期化: 前回選択していたリポジトリがあれば復元表示
(async () => {
  const path = await window.gitAPI.getRepoPath();
  if (path) {
    els.repoPath.textContent = path;
    setRepoActive(true);
    await refreshAll();
  }
})();
