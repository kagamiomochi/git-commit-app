# Git Commit App

シンプルなGit GUIクライアント（Electron製）。

## 機能

- フォルダを開いて既存のGitリポジトリを管理、またはリモートURLから新規クローン
- 変更ファイルをチェックボックスでステージ/アンステージ
- `feat` `fix` `refactor` `docs` `style` `test` `chore` `perf` をワンクリックでコミットメッセージに付与
- コミットメッセージを日本語で入力すると自動で英訳してからコミット（Google翻訳の無料APIを使用、オフにも切替可）
- プッシュ / プル / 直近のコミットログ表示

[最新のAppImageをダウンロード](https://github.com/kagamiomochi/git-commit-app/releases/latest)


## 翻訳について

`translate.googleapis.com` の無料エンドポイントを利用しています。API keyは不要ですが、非公式エンドポイントのため稀に応答が変わる/失敗することがあります。失敗時は日本語のまま自動コミットされます（コミットメッセージ入力欄の下のチェックボックスでこの自動翻訳自体をオフにもできます）。

より安定させたい場合は、DeepL API等の正式なAPIに差し替えることも可能です（`main.js` の `translate-text` ハンドラを変更）。

## 注意

- 初回起動時は必ず「フォルダを開く」または「クローン」でリポジトリを指定してください。
- プッシュ/プルはローカルのGit認証設定（SSHキー等）をそのまま利用します。

## OpenCommitでの自動生成について

コミットパネル右上の「🪄 OpenCommitで生成&コミット」ボタンは、[opencommit](https://github.com/di-sukharev/opencommit)の`oco --yes`コマンドを呼び出します。事前に以下が必要です。

```bash
npm install -g opencommit
oco config set OCO_API_KEY=<あなたのAPIキー>
```

このボタンを押すと、ステージされている変更（無ければ全ファイルを自動でステージ）からAIがメッセージを生成し、**確認無しでそのままコミット**します。このアプリのprefix選択・日本語自動翻訳の仕組みは経由しません。生成内容を事前に確認・編集したい場合は使わず、通常のコミット欄を使ってください。

`oco`コマンドが見つからない場合はエラーメッセージが表示されるので、上記のインストールを行ってください。

## 手動セットアップ

Node.js (v18以上推奨) がインストールされていれば動きます。CachyOS/Archなら:

```bash
sudo pacman -S nodejs npm
```

このフォルダで依存パッケージをインストール:

```bash
npm install
```

起動:

```bash
npm start
```

## デスクトップアプリのように起動できるようにする（任意）

毎回 `npm start` を打つ代わりに、ビルドして単体の実行ファイルにできます。

```bash
npm run dist
```

`dist/` フォルダにAppImageが生成され、ランチャー（Hyprlandのexec-onceやapp launcher）から直接起動できます。
