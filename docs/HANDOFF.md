# trk! Android版 開発引き継ぎ

最終更新：2026-10-29。これは **開発途中のソース**です。GitHub Actionsでdebug APKとAndroidネイティブコードのビルドは成功しましたが、Android実機検証は未実施です。画中絵や再生継続は試作であり、正式配布可能とは扱いません。

## 1. 取り込み元と資料

- このリポジトリは `TonbokiriRaikiriMuramasa-Taikoubou/trk-apk`。上流 `trk` のコミット `2b3383dc5051eb561213a7d4f875307a9e02b975`（trk214／1.1.4）を基に、Capacitor 8とAndroid向けUIを追加した。Google Driveの1.1.4 ZIPとはバイト比較していない。
- 現在のアプリIDは仮の `com.trk.agrg`、minSdk 24、target／compileSdk 36、開発版 `0.1.0-dev`。上流の配布バージョンとは別物。
- 上流の引き継ぎは [HANDOFF-UPSTREAM-trk214.md](HANDOFF-UPSTREAM-trk214.md)、さらに古い履歴は [HANDOFF-ARCHIVE.md](HANDOFF-ARCHIVE.md)。Android版の現状はこの文書を優先する。設計は [apk-development.md](apk-development.md)、Media3・イヤホン操作は [media3-plan.md](media3-plan.md)、安全性は [SECURITY.md](SECURITY.md) と [QUALITY-CHECKS.md](QUALITY-CHECKS.md)。
- 以前のDriveの `trk-apk-0.1.0-dev-2026-10-29` は初回マージ時点の古い開発ソースで、この変更は入っていない。Lat式モデルも含む。既存配布物は自動更新していない。

## 2. 実装と決定事項

### 画面・操作

- 下部ナビは **ライブラリ／エフェクト／再生／書斎／ゲーム**。右側のゲーム準備・スペクトラムを通常画面から格納し、取り込み口は「コンテンツを追加」に畳む。再生を維持してエフェクトを操作し、プレイヤーから選曲状態のままゲーム準備へ進む流れは仮置き。
- シンセは新規・音声リセット時にオフ。設定の詳細欄は初回閉じ、利用者の手動開閉を `trk_apk_settings_panels_v1` に保存する（検索による一時開閉は保存しない）。
- 🐔trk's playlistは起動時に自動作成せず、設定のカタログからリストを個別に追加する。既存リストの編集は上書きしない。紹介カタログは音源を同梱しない。
- Androidの戻るは `@capacitor/app` で全画面、確認ダイアログ、書斎、設定、エフェクト、プレイヤー、ゲームの順に対処し、最後に終了確認を出す。未知のモーダルを通り抜けない。Android実機で要確認。
- 画面の向きは通常は端末設定に従う。右下ボタンで現在の向きを一時固定／解除し、**10秒長押し**で緊急復帰を確認する。固定は保存しない。ボタンはモーダル・書斎中とゲーム中／一時停止／結果画面では隠す。長押し中のWebViewジェスチャー抑制を試みるが、OSの割り込みを含め実機未検証。ゲーム中の黒画面から戻る操作で選曲に復帰できるかも要確認。ゲーム画面の向きは実機を見て決める。

### 再生・画中絵・操作デバイス

- タイトル右上のアンテナで、裏画面の再生継続を試みる／一時停止する設定を切り替える。ゲームプレイ中は記録保護を優先する。現状はWebViewの再生で、OS・省電力・画面ロック等による中断を防げない。
- プレイヤー内の「画中絵を常に使用する」は初期オフ。オンでは動画のみを既定とし、音楽も含める設定では曲名とアプリアイコンを表示する。ゲーム中はPiPにしない。PiP非対応・拒否・移行失敗時はアンテナの設定に戻る設計。Androidライフサイクルや各機器での動作は未検証。
- PiPの選択 `trk_apk_pip_mode_v1` と音楽表示の好み `trk_apk_pip_audio_v1` は端末ローカルに保存され、設定バックアップには含まれず、全設定リセットで削除される。
- 「無音のまま再生を進める」は謎設定の候補として保留。MIDI／Web Audioも含めた消音と、元のミュート状態の復元を設計・検証するまでは実装しない。アンテナOFFの現行方針は一時停止。
- Web Media Sessionには再生／一時停止と前後の曲の入口がある。重複するplay/pause命令で逆動作しないよう修正し、Activityの音量キーをメディア音量に関連づけた。**Android通知・ロック画面・イヤホン操作は未検証。** Media3の再生サービスはまだない。
- Shokz OpenRun Pro 2の音量＋／－、多機能ボタン1回／2回／3回を対応目標として記録。[media3-plan.md](media3-plan.md) に公式情報、Web Audioとの統合課題、安全性、受け入れ条件を記載。AndroidX Media3はMITではなくApache-2.0。

### データ・権利・安全性

- AndroidではSWを新規登録せず、旧同スコープSWとバージョン別シェルキャッシュのみ削除する。共有インボックスや利用者データは消さない。旧Workerが制御中なら一度だけ再読み込みする。Web/PWAのSWは維持。
- Android自動バックアップは無効に設定し、Android 12以降のクラウド／端末間転送から全バックアップ対象ドメインを除外するルールを追加した。実機・メーカー固有ツールでの動作は未確認。移行前は必要に応じて明示的にバックアップを書き出す。FileProvider外部領域はアプリ固有Picturesに制限。署名鍵の除外を追加。Android共有インテント、ネイティブSAF・MediaStore、永続フォルダ権限は未実装。取込入口は削除しない。
- Lat式ミクのモデル・テクスチャは現在の作業ツリーとAPK用生成物から外し、[Lat様の配布先](https://bowlroll.net/file/30199)を案内する。ユーザーが既に保存したモデルは自動削除しない。Git履歴・過去のDrive配布物には残る。
- MMDの内蔵モーションは65種をすべて選択可能、🎤 歌・口パクの6グループを含む。モーション検査はLat式Ver.2.31の名前だけのfixtureを用い、現在の配布モデルとの互換性は保証しない。`BELIEVE.ogg` 等の外部音源は同梱しない。
- Lat式を外しても `js/characters/miku.js` 等の初音ミク二次創作や東方素材は残る。ストア配布条件・ライセンスの確認が必要。`fx-synth.js`と楽譜の空白だけの差分は上流に戻した。

## 3. 開発・ビルド

Node.js 22以上、npm、JDK 21、Android Studio／Android SDK 36が必要。Gradle依存物とSDKは別途取得する。

```sh
npm ci
# assets/vendor 内の build / dist が欠ける場合に復元
npm run vendor:update
npm run check
npm run cap:sync
npm run cap:open:android
# または SDK と JDK を設定後
cd android && ./gradlew assembleDebug
```

`android/` は生成済みのため `cap:add:android` は再実行しない。`cap:sync` はGit管理外の `mobile-web/` と `android/app/src/main/assets/public/` を再生成する。`assets/vendor/` は固定済み依存物で内側の `dist/`・`build/` も必要。更新時は `tools/vendor-lock.json` と `npm run check:vendor:npm` を確認する。署名鍵・音源・ビルド出力はGitに入れない。

## 4. 検証状況と優先作業

- `npm run check` は709件成功（37スイート）。`npm run cap:sync`、`git diff --check` も成功。`npm run check` には `tools/check-security.mjs` などの静的検査も含む。JSの単体・結合テストはjsdomやモックであり、Androidネイティブコードのコンパイル、描画、実音声、Bluetoothを検証しない。
- 作業環境にはJDK／Android SDKがないが、GitHub Actionsの [初回成功ビルド](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40746889673)（コミット `aa02acc`）で `npm ci`、`npm run check`、`cap:sync`、Javaを含む `assembleDebug` が成功し、debug APKが7日間の成果物として保存された。debug APKはGradleのdebug鍵で署名され、一般配布用ではない。**実機動作は未確認。** レビューでは以前の版を390×844の実ブラウザーで確認しているが、この環境ではChromiumのシステムライブラリ不足により今回の修正後のレイアウトは確認できていない。
- 実機の手順と記録欄は [ANDROID-DEVICE-CHECKS.md](ANDROID-DEVICE-CHECKS.md)。段階的な開発・採らなかった案は [decisions/0001-android-milestones.md](decisions/0001-android-milestones.md)。
- 優先：SDK／JDK環境でクリーンビルドし、Android実機で取り込み・再接続、再生／FX／ゲーム、書斎、戻る、向き固定、PiP、アンテナ、端末ロックと出力切替を確認。特にPiP遷移・停止・外部ピッカー・字幕・画面向きの競合を評価する。
- Media3の導入・キューと既存FXの両立・権限・通知・Audio Focus・Bluetoothを設計し、Shokz OpenRun Pro 2で実機検証する。サービスやアプリが終了した場合の挙動も決める。
- アプリID、ゲーム画面の向き、その他素材の配布条件は未決。SAF／MediaStore、遅延タップ補正、APK同梱docs削減、無音継続も今後の課題。
- 開発用Capacitor CLIの依存 `xcode` → `uuid` にmoderateのnpm audit指摘（2026-10-28）。別途更新互換性と実機のセキュリティ・権利・プライバシーを確認する。

## 5. 主なファイル

| 場所 | 内容 |
| --- | --- |
| `index.html`, `css/apk-mobile.css`, `js/apk-mobile.js` | スマホ画面、ナビ、エフェクト・再生導線、緊急復帰操作 |
| `js/apk-native.js`, `js/apk-background.js`, `android/app/src/main/java/com/trk/agrg/` | Android戻る、SW整理、向き・PiP試作 |
| `js/fx-dock.js`, `js/media-player-mode.js`, `js/library.js`, `js/media.js` | アンテナ、Web Media Session、キュー、Web再生・解析 |
| `js/apk-settings-panels.js`, `js/synth-mode.js`, `js/core.js` | 設定開閉とシンセの初期値・保存 |
| `android/`, `capacitor.config.ts`, `tools/prepare-mobile-web.mjs` | AndroidシェルとWeb資産同期 |
| `tests/apk-*.test.mjs`, `tests/trk-playlists.test.mjs` | Android向けDOM・結合テスト、プレイリスト検査 |
