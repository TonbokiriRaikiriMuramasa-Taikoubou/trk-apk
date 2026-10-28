# trk! Android版 開発引き継ぎ

最終更新：2026-10-29。これは **開発途中のソース**であり、APKの完成版・配布版ではありません。

## 1. 現在地

- リポジトリ：`TonbokiriRaikiriMuramasa-Taikoubou/trk-apk`。上流 `trk` の commit `2b3383dc5051eb561213a7d4f875307a9e02b975`（trk214、配布名 1.1.4）を土台にした。Drive 上の1.1.4 ZIPとはバイト比較していない。
- 既存のWebアプリを Capacitor 8 で包む初期実装。アプリID `com.trk.agrg`、Android minSdk 24、target/compileSdk 36、開発用 version `0.1.0-dev`。上流の 1.1.4 と Android版の開発バージョンは別物。
- 上流の詳しい現状・設計・移行・過去のデスクトップ配布手順は [上流 trk214 の引き継ぎ](HANDOFF-UPSTREAM-trk214.md) にそのまま保存した。さらに古い履歴は [HANDOFF-ARCHIVE.md](HANDOFF-ARCHIVE.md)。この文書と食い違うAndroid版の仕様は本書を優先する。
- 詳細な設計・根拠・Android権限の調査は [apk-development.md](apk-development.md)。安全性は [SECURITY.md](SECURITY.md)、検査の限界は [QUALITY-CHECKS.md](QUALITY-CHECKS.md)。

## 2. 今回実装したこと

- 下部に **ライブラリ／エフェクト／再生／書斎／ゲーム** の5項目。再生中にエフェクトを調整し、プレイヤーに戻る導線を設けた。動画のプレビューもエフェクト画面に移す。再生画面からゲーム準備へ入り、選択曲で譜面を生成する流れは仮置き。
- 右側のゲーム準備・スペクトラムは通常のスマホ画面から格納。曲・動画・パック等の取込入口は「コンテンツを追加」に畳んだ。操作自体は削除していない。
- 🎹 シンセは新規・音声設定リセット時にオフ。設定のチェックで使用開始。保存済みの旧設定は尊重する。
- 設定の各詳細欄は初回閉じ、手動開閉だけ `trk_apk_settings_panels_v1` に端末保存する。検索による開閉は記録しない。全設定リセットで消す。この表示状態は設定バックアップ対象外。
- 🐔 trk's playlist は初回起動・チュートリアル完了時に自動作成しない。設定でカタログからリストを一つずつ選択して追加する。新しいカタログ項目は選択肢へ現れる。削除したものも個別に再追加でき、既存リストの名前・曲・wish・移動を自動同期で上書きしない。音源はカタログに同梱しない（任意デモを除く）。
- 上流の既存ゲーム・プレイヤー・書斎・モードは残している。上流のMMDは、内蔵モーション65種をすべて選択可能で、🎤 歌・口パクの6グループを含む。権利・音源は [NOTICE.md](../NOTICE.md) を参照。`BELIEVE.ogg` など外部音源は同梱されない。

## 3. 開発環境・ビルド

Node.js 22以上、npm、JDK 21、Android Studio／Android SDK 36 が必要。Gradle依存物とSDKは別途取得する。

```sh
npm ci
# assets/vendor のファイルが欠けている場合だけ、npmレジストリから復元
npm run vendor:update
npm run check
npm run cap:sync
npm run cap:open:android
# または SDK と JDK を設定後
cd android && ./gradlew assembleDebug
```

`android/` は既にあるため `cap:add:android` は再実行しない。`cap:sync` は `mobile-web/` と `android/app/src/main/assets/public/` を生成しコピーする。これらとビルド出力、`node_modules/`、署名鍵・ローカル音源はGitに入れない。`assets/vendor/` はアプリに必要な固定済み依存物で、内側の `dist/`・`build/` も含めて保持する。`tools/vendor-lock.json` を正とし、更新後は `npm run check:vendor:npm` を実行する。

現時点の環境にはJDK／Android SDKがなく、APKは作成していない。上記のAndroidビルド手順は未検証。署名、アプリID、バージョン、権利・プライバシーを確認するまで配布しない。

## 4. 検証済み／未検証

- `npm run check`：692テスト成功（37スイート、静的検査含む）。`tools/check-security.mjs`、アクセシビリティ・vendor等も実行。`npm run cap:sync` と `git diff --check` 成功。
- jsdomで実際のtrkスクリプトを読み込み、5項目、画面切替・再生状態、シンセの初期値、設定開閉、🐔リストの選択／再追加／上限・編集保持を検証した。jsdomは実機や描画・音声の保証ではない。
- **未確認**：APKのビルド、Android WebView・実機、実音声・動画、表示・タッチ・縦横回転・戻るキー、実ブラウザーのレイアウト。サンドボックスのChromiumは必要なシステムライブラリ不足で動かなかった。
- WebViewのフォルダ選択・永続権限・IndexedDB容量は未確認。AndroidのSAF／MediaStoreのネイティブ接続、自動スキャン、Media3のバックグラウンド再生サービスは未実装。現状は画面が非表示になると動画を一時停止する経路がある。
- 開発用 Capacitor CLI の依存 `xcode` → `uuid` に moderate の npm audit 指摘（2026-10-28）。更新の互換性を要確認。別途実機のセキュリティ・権利・プライバシー確認が必要。

## 5. 主なファイルと次の作業

| 場所 | 内容 |
| --- | --- |
| `index.html`, `css/apk-mobile.css`, `js/apk-mobile.js` | スマホ画面、5項目ナビ、エフェクト・再生導線 |
| `js/apk-settings-panels.js`, `js/synth-mode.js`, `js/core.js` | 設定開閉とシンセの初期値・保存 |
| `js/library.js`, `js/catalog.js`, `js/main.js` | 🐔の選択・既存プレイリスト・チュートリアル |
| `android/`, `capacitor.config.ts`, `tools/prepare-mobile-web.mjs` | AndroidシェルとWeb資産同期 |
| `tests/apk-*.test.mjs`, `tests/trk-playlists.test.mjs` | APK向けDOM・結合スモークとプレイリスト検査 |

1. JDK／SDKを用意し、クリーン環境で `npm ci` → `npm run check` → `npm run cap:sync` → `./gradlew assembleDebug` を確認する。
2. Android実機で音楽／動画取込、再接続、再生・エフェクト切替、ゲーム移行、書斎、プレイリスト、回転・戻る操作を確認する。
3. 必要に応じてSAF・MediaStoreとMedia3を設計する。インストール時の権限だけで任意フォルダへの永続アクセスを得られると仮定しない。
4. 変更前に `git status --short` を確認し、指定された作業ブランチを使ってPRで反映する。上流デスクトップ版の配布ZIP作成方法は [上流資料 §9](HANDOFF-UPSTREAM-trk214.md) を参照し、このAndroid開発ソースを1.1.4の公式配布物と混同しない。
