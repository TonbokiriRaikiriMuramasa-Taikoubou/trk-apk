# trk! Android版 開発引き継ぎ

最終整理：2026-10-29。**開発途中・物理Android実機未検証。** エミュレーターとdebug APKビルドの成功は、実機・実音声・Bluetooth・正式配布の合格ではない。現行の概要はここ、個々の根拠や古い履歴はリンク先を参照。

## 現在地

| 段階 | 状況 |
| --- | --- |
| M0 ビルド基盤 | Capacitor 8、debug APKとAPI 35エミュレーターCIを整備 |
| M1 実機スモーク | 未実施。まず [実機チェック表](ANDROID-DEVICE-CHECKS.md) |
| M2 安定化 | 安全対策・回帰試験を継続。音声経路とOSライフサイクルは実機要確認 |
| M3 Media3・イヤホン | 設計・テスト専用実験のみ。製品Bridge／MediaSessionService／Audio Focus未実装 |
| M4 取り込み・共有 | ネイティブSAF永続フォルダ、MediaStore自動取得、Android共有受信は未実装 |
| M5 正式配布 | 未実施。配布用署名鍵・正式ID・権利確認・実機確認が必要 |

リポジトリは `TonbokiriRaikiriMuramasa-Taikoubou/trk-apk`。基礎は上流 `2b3383dc5051eb561213a7d4f875307a9e02b975`（trk214／1.1.4）、その後にPC版1.1.5〜1.1.7の一部をAPK向けに統合。Drive ZIPとのバイト一致は未確認。[PC版との差分](UPSTREAM-1.1.5-1.1.7-REVIEW.md) と [レビュー後の対応](UPSTREAM-REVIEW-FOLLOWUP-2026-10-29.md) に採否・検証・未確認を記録。アプリID `com.trk.agrg` は仮、`versionCode 1`／`0.1.0-dev`、minSdk 24／target・compileSdk 36。

## 機能と重要な制限

- 下部ナビはライブラリ／エフェクト／再生／書斎／ゲーム。ゲーム準備やスペクトラムは通常画面から格納し、プレイヤーから選曲中の曲でゲームへ。実ゲーム・狭画面は未検証。
- シンセ初期OFF（既存保存は維持）、設定欄は初回閉じて開閉を端末に記録。trk's playlistは設定から個別追加し、音源は含まない。既存カタログ自動更新は利用者編集の保護との両立が未決で保留。
- お気に入り4フォルダ・ピン・凍結を保存。解除は既定3秒長押し、謎設定でワンタップに変更可能。部分設定バックアップはfavsの種類・項目単位で欠落値を保護し、不正部分を報告する。実際のPCバックアップとの往復は未検証。譜面方式は新規・初期化時B、保存済み1〜4は維持。trkリスト表示切替と編集可能コピーを統合。
- 通常の画面向きは端末設定に従う。右下ボタンで一時固定／解除し、10秒長押しで緊急復帰を確認する。ゲーム向き・緊急復帰の操作感は実機要確認。
- アンテナOFFは背景で一時停止、ONは再生継続を試みる。PiPは初期OFF・既定で動画のみ。OSによる停止や復帰順序の実機検証は必要。無音で再生を進める案は保留。
- 「前へ」は既定で3秒超なら現在曲先頭、3秒以内は前曲。謎設定で常に前曲へ変更可能。ゲーム中は譜面同期保護のため既存の曲送りを維持。
- イヤホン切断時の音声停止・再開抑止、FX復旧失敗時の安全側ロックと警告、renderer終了後の復旧を試作。モック／エミュレーターの結果は実際の切断や出力抑止を保証しない。詳細は [Media3導入前レビュー対応](MEDIA3-REVIEW-FOLLOWUP-2026-10-29.md)。
- ファイル選択・フォルダ再接続・IndexedDB容量は実機未検証。Android自動バックアップ・端末間転送には除外ルールを設定したがメーカー固有の挙動は未検証。全設定書き出しは完全バックアップではない。
- Lat式ミクのモデルは同梱せず[作者の配布先](https://bowlroll.net/file/30199)を案内。持ち込みと内蔵モーションは維持し、65種をすべて選択可能。🎤 歌・口パクの6グループを含む。描画・互換性は未保証。`BELIEVE.ogg` 等の外部音源は同梱しない。FIRST SPARKは任意デモ。古い履歴・Driveの古い成果物にはLatモデルを含むものがある。

## ビルド・配布

Node.js 22以上、JDK 21、Android SDK 36が必要。詳細は [開発ガイド](apk-development.md)、利用者のdebug APK入手は [README](../README.md)、正式署名・ソース・権利の手順と未完了項目は [APK配布準備](APK-DISTRIBUTION.md)。署名鍵をGitやチャットに入れない。

```sh
npm ci
# vendorのbuild / distが欠けている場合のみ npm run vendor:update
npm run check
npm run cap:sync
cd android && ./gradlew assembleDebug
```

`android/` は生成済みのため `cap:add:android` を再実行しない。`cap:sync` がGit管理外の `mobile-web/` とAndroid内のWeb資産を生成する。debug APKは `android/app/build/outputs/apk/debug/app-debug.apk`。Actions成果物は7日保存、署名鍵がビルドごとに異なることがあり、再インストールでデータを失うおそれがある。`npm run check` は `tools/check-security.mjs` を含む。品質と権利は [QUALITY-CHECKS.md](QUALITY-CHECKS.md)、[SECURITY.md](SECURITY.md)、[NOTICE.md](../NOTICE.md) も確認。

## 確認済みの範囲

- `344ed24`：`npm run check` は811件／41スイート、`cap:sync` 成功。[debug APK](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40838382914) と [API 35エミュレーター](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40838382902) 成功。実WebViewにAndroid入力コマンドを送った短押し・3.5秒固定座標長押しは成功、物理タッチではない。
- `94a9e24`：[debug APK build](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40838954037) 成功。Actions成果物は期限付きで、正式配布用ではない。
- Media3実ライブラリの検査は `androidTestImplementation` のみ。偽Player・偽再生主体による状態不一致や再入の反例があり、方式は未決。通知UI・実Bluetooth・実音声は未検証。[段階Aの設計](MEDIA3-STAGE-A-DESIGN-2026-10-29.md)、[計画](media3-plan.md)を参照。
- 以前のCI結果・失敗と未解決事項は [整理前の履歴](HANDOFF-2026-10-29-HISTORY.md)、[進捗](PROGRESS-2026-10-29.md) を参照。jsdom／モック／入力注入は実機評価の代わりではない。

## 次の作業

1. 物理端末で上記の取り込み、再生・FX、ゲーム、書斎、タッチ、音声出力、PiP・回転・Back、データ保全を [チェック表](ANDROID-DEVICE-CHECKS.md) に沿って記録。
2. [Media3計画](media3-plan.md)と[段階Aの設計](MEDIA3-STAGE-A-DESIGN-2026-10-29.md)に従い、既存Web Audio・FX・譜面同期を守る橋渡し、割込み・状態競合を検討。物理Shokz等のメディア操作は未検証。
3. SAF・共有と再接続、既存カタログ更新時の利用者編集保護、バックアップ往復、韓国語を含む翻訳の母語レビューを検討。
4. 正式配布前に [APK配布準備](APK-DISTRIBUTION.md) の署名・ID・バージョン・ライセンス・利用条件・配布先を確認。無料・非営利でも第三者の条件確認は必要。

詳細な優先順位は [NEXT-ACTIONS](NEXT-ACTIONS-2026-10-29.md)。仕様の過去記録は [APK-SPEC](APK-SPEC-2026-10-29.md)、上流の引継ぎは [HANDOFF-UPSTREAM-trk214.md](HANDOFF-UPSTREAM-trk214.md)、更に古い経緯は [HANDOFF-ARCHIVE.md](HANDOFF-ARCHIVE.md)。
