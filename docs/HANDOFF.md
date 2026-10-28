# trk! Android版 開発引き継ぎ

最終整理：2026-10-29。**開発途中のAndroid版であり、実機未検証です。** GitHub Actionsでdebug APKのビルドは成功していますが、正式配布版ではありません。画中絵・裏再生・取り込み等は、OSや端末によって動作しない可能性があります。

## 1. 現在地と資料

- このリポジトリは `TonbokiriRaikiriMuramasa-Taikoubou/trk-apk`。上流 `trk` の `2b3383dc5051eb561213a7d4f875307a9e02b975`（trk214／1.1.4）を基にしたCapacitor 8のAndroid版。Drive上の1.1.4 ZIPとのバイト一致は未確認。
- 仮アプリID `com.trk.agrg`、開発版 `0.1.0-dev`、minSdk 24、target／compileSdk 36。ゲーム機能・Web再生・書斎などを引き継ぐが、Androidでの動作は機能ごとに確認する。
- **仕様の固定記録**：[APK-SPEC-2026-10-29.md](APK-SPEC-2026-10-29.md) は `9c53d5c` 時点の上流との差分と未検証・今後の方針をまとめたもの。[同一ファイルのDrive版](https://drive.google.com/file/d/1JwyQL83Hz55Qnl1vP01QSqUuWjNtoMbU/view)のSHA-256は `57dcf085bf026278fb74ab811cf08913717d9388f995ff4806dcb7aac08e7081`。以降の仕様変更は本HANDOFFと新しい記録を優先する。
- **これから行える作業**：[優先順位付き作業一覧](NEXT-ACTIONS-2026-10-29.md)。端末なしで進める対策、実機が必要な確認、利用者の判断待ちを区別する。Media3段階Aの通信・競合・状態の[設計案](MEDIA3-STAGE-A-DESIGN-2026-10-29.md)を追加したが、実装はまだない。
- 詳細：[Android設計](apk-development.md)／[実機チェック表](ANDROID-DEVICE-CHECKS.md)／[Media3計画](media3-plan.md)／[Media3導入前レビュー依頼](MEDIA3-PRE-IMPLEMENTATION-REVIEW-REQUEST.md)／[段階的開発の判断](decisions/0001-android-milestones.md)／[開発作業の承認範囲](decisions/0002-development-authorization.md)／[安全性](SECURITY.md)／[品質検査](QUALITY-CHECKS.md)。上流の引き継ぎは [HANDOFF-UPSTREAM-trk214.md](HANDOFF-UPSTREAM-trk214.md)、古い経緯は [HANDOFF-ARCHIVE.md](HANDOFF-ARCHIVE.md)。
- 以前のDriveフォルダ `trk-apk-0.1.0-dev-2026-10-29` は古い開発ソースでLat式モデルを含む。後の `trk-apk-review-source-plan-2026-10-29` はPR #2時点であり、今回の変更や実機結果を含まない。いずれも自動更新していない。

## 2. 実装済みの方針・制約

### UI・ゲーム

- 下部ナビは **ライブラリ／エフェクト／再生／書斎／ゲーム**。取り込み口と右側のゲーム準備・スペクトラムは通常画面から格納。再生を維持してエフェクトを操作し、選択曲からゲーム準備へ進む導線は仮置き。詳細設定を開く際はプレイヤーを閉じる。
- シンセは新規・音声設定初期化時OFF（既存保存設定は尊重）。設定欄は初回閉じ、手動開閉を `trk_apk_settings_panels_v1` に保存。検索の一時開閉は保存せず、開閉状態は設定バックアップ対象外・全設定リセットで削除。
- 🐔trk's playlistは自動一括追加せず、設定のカタログから個別に追加。既存の編集は上書きしない。カタログ自体は音源を含まない。
- Android Backは既知の全画面・確認・書斎・設定・プレイヤー・ゲームを段階的に戻し、未知のモーダルは安全側で消費。予測型戻るや各画面は実機要確認。
- 画面向きは通常は端末設定。右下ボタンで一時固定／解除、10秒長押しで緊急復帰を確認する。ゲーム中／一時停止／結果・モーダル・書斎では非表示。長押しと、ゲーム中の黒画面から戻る経由の復帰は実機未検証。ゲーム向きは実機評価後に決める。

### 再生・PiP

- Media3導入前レビューの対応は [レビュー対応記録](MEDIA3-REVIEW-FOLLOWUP-2026-10-29.md) を参照。非表示イベントの伝播を維持して押下操作を解除し、逆再生のMedia Session状態を同期した。renderer終了時はネイティブの復旧画面を表示し、明示的な画面再起動後も再生開始操作まで自動再生を抑止する試作を追加した。OS・実機の安定性、データ保持、再生経路は未検証。イヤホン切断はAndroidのnoisy通知を受けて停止・自動再開抑止を試みる暫定対策を追加したが、音声経路・通知配送・物理端末でのスピーカー再生防止は保証できない。
- 出力切断時のシンセは、押鍵中だけでなく離鍵済みのリリース余韻も追跡して即時切断するよう修正。通常の離鍵・画面退避のリリースは維持。モック音声ノードと実スクリプトのイベント連携を検査したが、実音声・物理出力の切替は未確認。タイミング測定の最大20個・約10秒先までの予定音も、切断時に取り消し測定を中止する。ゲームのヒットSE・カウント・失敗／CATCH音もsourceと出力を追跡し、切断時に停止・disconnect、明示再開前の自動発音を抑止する。SE試聴ボタンの実際の操作は、曲の再生ガードを解除せず新しい試聴だけを許す。FXは独立した最終出力を切断し、アドオン由来のFX経由メディアも停止。明示再開時はEQ・ゲーム連動・リミッターとプリセット／追加ミックス経路を作り直して残響を破棄し、設定を維持して出力を戻す。再構築失敗時はFXを無音側に残し、エラーをログへ出す（利用者向けの復旧UIは未実装）。偽AudioNodeでの検査のみであり、実broadcast・実音声・物理端末やすべてのアドオン音声は未検証。
- タイトル右上のアンテナOFFは裏画面で一時停止、ONは継続を試みる。WebView再生にはOS・省電力・ロック等による中断の可能性があり、継続を保証できない。ゲーム中は記録保護を優先。
- プレイヤー内の自動画中絵は初期OFF。ON時は動画のみが既定で、音楽も含める選択肢あり。ゲーム中は対象外。動画の枠比率は動画寸法をAndroidの範囲に丸め、音楽・寸法不明は16:9。専用のPiP再生／停止ボタンは未実装。PiP移行や動画表示は実機未検証。
- PiP移行の1.5秒フォールバックは、前景復帰・PiP開始・次の移行で古いタイマーを無効化する。未稼働時の重複したPiP終了通知はアンテナONの背景再生を停止しない。PiPが稼働中から終了し、その時点で非表示なら停止する。OSの通知順序は実機未確認。
- Androidで非表示・アンテナOFF・PiP非稼働の間、Web Media Sessionの再生／前後曲命令は受け付けず、停止／シークは受け付ける。読み込み途中で背景に移った場合も、対象の自動再生・プレビュー・リピートを抑止する。前景、アンテナON、実際に稼働中のPiPでは許可する。非同期の全再生経路やOSからの操作は実機未検証。
- 逆再生中のMedia Session一時停止は通常再生へ切り替えず停止する。非同期準備中の停止・新しい逆再生に対し古い準備が音を出さないよう無効化する。Androidで背景再生が許されない場合、またはPiP終了後に背景再生が許されなくなった場合の逆再生も停止する。音声・実機確認は未実施。
- PiP設定 `trk_apk_pip_mode_v1`／`trk_apk_pip_audio_v1` は端末内に保存し、設定バックアップには含まれず全設定リセットで削除。
- Media3、ネイティブMediaSessionService、Audio Focus統合は**未実装**。Web Media Sessionのplay/pauseを冪等化し、プレイヤーを閉じた後もシーク・速度等による位置の変更と現在曲のタグをイベントで反映する。曲切替／読込中は旧曲の位置をクリアする。Activity表示中の音量キーは `STREAM_MUSIC` に関連付けたが、通知・ロック画面・Bluetoothでの反映や逆再生中の位置は未検証。Shokz OpenRun Pro 2の音量＋／－と多機能ボタン1／2／3回は対応目標。
- 無音のまま再生を進める「謎設定」は保留。MIDI／Web Audioを含む消音と元の状態の復帰を設計・検証してから判断する。

### データ・権利

- AndroidはService Workerを新規登録せず、旧同スコープWorkerとバージョン別シェルキャッシュだけを整理。共有インボックスや利用者データは消さず、Web／PWAのSWは維持。
- 自動バックアップ無効に加え、Android 12以降のクラウド／端末間転送の対象ドメインを除外するルールを設定。OS・メーカー製移行ツールでの動作は実機未確認。必要なデータは機種変更前に明示的にバックアップする。FileProvider外部領域はアプリ固有Picturesに限定。
- 現在の取り込みUIは残す。OS共有インテント受信、ネイティブSAF／MediaStore、永続フォルダ権限は未実装。WebViewのファイル選択・フォルダ再接続・IndexedDB容量は実機未検証。`INTERNET` 権限は現状維持。
- Lat式ミクのモデル・テクスチャは現行ソースとAPK生成物に同梱せず、[作者の配布先](https://bowlroll.net/file/30199)を案内。持ち込みと内蔵モーションは維持し、65種をすべて選択可能。🎤 歌・口パクの6グループも含む。テストfixtureはLat Ver2.31の骨・モーフ名のみで、現行モデルとの互換性・描画は保証しない。`BELIEVE.ogg` 等の外部音源は同梱しない。古いGit履歴・Drive配布物にはモデルが残る。
- 初音ミク二次創作や東方素材は残る。個人・非営利でも採用物ごとの利用・改変・再配布・クレジット・NOTICE・ストア条件を確認する。署名鍵をGitに入れない。権利は [NOTICE.md](../NOTICE.md) も参照。

## 3. ビルドと検証

Node.js 22以上、npm、JDK 21、Android SDK 36が必要。SDK・Gradle依存の取得には通信が必要。

```sh
npm ci
# 固定vendorの build / dist が欠けている場合のみ復元
npm run vendor:update
npm run check
npm run cap:sync
npm run cap:open:android
# または SDK と JDK を設定後
cd android && ./gradlew assembleDebug
```

`android/` は生成済みなので `cap:add:android` は再実行しない。`cap:sync` はGit管理外の `mobile-web/` と `android/app/src/main/assets/public/` を再生成。`assets/vendor/` は固定依存物で内部の `dist/`・`build/` も必要。変更時は `tools/vendor-lock.json` と `npm run check:vendor:npm` を確認。

- `npm run check`：**759件成功、37スイート**。`tools/check-security.mjs` 等の静的検査も含む。`cap:sync`、`git diff --check` も成功。jsdom／モックはAndroid描画・音声・Bluetoothの検証ではない。
- [debug APKビルド](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40790038824)：renderer復旧、シンセ・測定音・ゲームSE・FXの切断対策を含む `e707a12` で成功。Actions成果物は7日間保存。debug鍵はランナーごとに変わり得るため、別ビルドを上書きできない場合がある。既存データを消す前にバックアップを確認する。正式配布用の署名ではない。
- [Android API 35エミュレータースモーク](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40750871895)：`0d24a96` で初回起動、Backキーによる初回案内終了、向き固定ブリッジ、PiP比率の計算・橋渡しが成功。物理タッチ・10秒長押し・PiP移行や表示・音声・Bluetoothは検査していない。`9c53d5c` までの後続差分は文書更新。
- [追加のAPI 35エミュレーター検査](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40755872214)（`2db4f58`）で、PiPへの明示的なネイティブ移行、ActivityのPiP状態、WebViewへの開始通知を確認。PiP非対応・無効の場合はスキップし、テスト結果の欠落はCIエラーにする。以前の実行では[instrumentationが切断](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40754911823)され、[次の実行](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40755698374)もエミュレーター準備段階で失敗した。原因は未特定で、以後の実行でも再発を確認する。成功した後続実行も自動PiP、動画・音声再生、復帰／終了時の通知順序や物理端末を検証しない。
- [API 35エミュレーター検査](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40781914878)（`4e09306`）で `chrome://crash` によりrendererを2回終了し、その都度の復旧画面・手動再起動・テスト用localStorageの保持・再生抑止を確認。noisy通知もpluginから模擬したが、OSの実際のイヤホン切断や音声出力は再現していない。PiP中の異常終了、強制終了、実機・他OSは未検証。
- [API 35エミュレーター追加検査](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40782607596)（`bdb6807`）で復旧画面の背景→前景と、復旧後のActivity再生成時の保護も確認。シンセ・測定音・ゲームSE・FXの後続修正はエミュレーターで検査していない。
- **Android実機試験は未実施。** 機種・OS・APKコミットを記録し、[チェック表](ANDROID-DEVICE-CHECKS.md)で検証する。JS・エミュレーター・ビルド成功を実機合格に置き換えない。
- 開発用Capacitor CLIの `xcode` → `uuid` にmoderateのnpm audit指摘（2026-10-28）。本番依存のみの監査は0件。更新の互換性を別途検討。

## 4. 次の作業と未決事項

[レビュー依頼](MEDIA3-PRE-IMPLEMENTATION-REVIEW-REQUEST.md)への回答を精査し、実装修正・実機確認・保留項目を[対応記録](MEDIA3-REVIEW-FOLLOWUP-2026-10-29.md)に切り分けた。具体的な進め方と完了条件は[作業一覧](NEXT-ACTIONS-2026-10-29.md)を参照。実機を待つ間も、イヤホン切断とrenderer終了復旧の試作について、競合・OSライフサイクル・音声・データ保持を検証する。どちらも最善努力であり物理端末では未検証。次のマイルストーンは以下のとおり。

1. **M1 実機スモーク（優先）**：まずアンテナON／OFFとPiPの組合せ、ホーム移動・素早い復帰と再移動、PiPからの復帰／終了を[チェック表](ANDROID-DEVICE-CHECKS.md)に沿って確認。取り込み・再接続、再生／FX、5ゲームモード、書斎、戻る、向き・緊急復帰、ロックと音声出力も順次記録する。M1は未完了。
2. **M2 安定化**：実機がない間も再現可能な回帰テストやエミュレーター検査を追加し、上記CI失敗の再発を観察する。実機で見つかった不具合・遅延やタップ校正は実測して対応。未知のモーダルで任意のボタンを押すBack処理は、削除や承認の誤発火を防ぐため保留。
3. **M3 Media3・イヤホン**：実機検証と並行して既存WebViewのFX・解析・譜面同期を保つ橋渡し案を具体化し、再生状態・キュー・操作の同期、Audio Focusやライフサイクルを整理する。WebViewが停止すれば橋渡しだけでは継続できない。必要な場合のみFXなし聴取専用ExoPlayerを検討。詳細・ライセンス・Shokz試験は [media3-plan.md](media3-plan.md)。
4. **M4 取り込み**：SAFと共有インテント、永続URI、動画の範囲アクセスとシーク、権限喪失時の再接続を設計・検証。
5. **M5 配布**：署名鍵の管理、GPL対応ソース、各素材・依存物の条件、配布先を確認。正式appId、ゲーム画面の向き、東方なしビルド、プロセス終了後の自動再開、同梱docs削減は未決。

## 5. 主なファイル

| 場所 | 役割 |
| --- | --- |
| `index.html`, `css/apk-mobile.css`, `js/apk-mobile.js` | Android画面、5ナビ、エフェクト導線、向きと緊急復帰のUI |
| `js/apk-native.js`, `js/apk-background.js`, `android/app/src/main/java/com/trk/agrg/` | Back・SW整理、PiP・向きのネイティブ試作 |
| `js/media-player-mode.js`, `js/fx-dock.js`, `js/library.js`, `js/media.js` | Web再生・Media Session・アンテナ・キュー・エフェクト |
| `js/apk-settings-panels.js`, `js/synth-mode.js`, `js/core.js` | 設定の開閉、シンセ初期値と保存 |
| `android/`, `capacitor.config.ts`, `tools/prepare-mobile-web.mjs` | AndroidシェルとWeb資産の同期 |
| `.github/workflows/`, `tests/apk-*.test.mjs`, `android/app/src/androidTest/` | debugビルド、JS回帰・エミュレーター検査 |
