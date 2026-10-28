# trk! Android版：Media3導入前レビューのお願い

作成日：2026-10-29（日本時間）／対象：同梱ソースと、その `docs/HANDOFF.md`・`docs/media3-plan.md`・`docs/ANDROID-DEVICE-CHECKS.md`。同梱ZIPの正確なコミットとSHA-256は、ZIPに添付の `README-REVIEW.md` と `SHA256SUMS.txt` を参照してください。レビュー依頼とHANDOFFを整える直前の実装基準は `fa87afb`（PR #4後の変更を含む）です。

## お願いしたいこと

Media3の実装を始める前に、**現行実装の不具合・安全性と、導入方針の妥当性を分けてレビュー**してください。提案だけを前提にせず、ソース全体の実際の呼び出し順と状態遷移を追い、間違い・見落とし・実機でしか確認できない点を指摘してください。Media3未実装を既存の不具合と混同しないでください。

レビュー対象は開発版です。ソースZIPはAPKではなく、正式配布版でもありません。実機試験、Shokz、通知・ロック画面での操作、実音声・PiP遷移は未検証です。再生の維持、ゲーム、Web Audio／FXや既存のWeb・PWA利用を壊さず、Androidでの音楽・動画操作を改善することが目的です。

## 現在の構成と目的

- 再生主体はWebViewの `core.video`、Web Audio／trk FX、MIDIやゲームです。Web Media Sessionは命令とメタデータを扱いますが、Androidの通知・Bluetooth・ロック画面に期待どおり届く保証はありません。Media3、`MediaSessionService`、Audio Focus、ネイティブ再生サービス、SAFは未導入です。
- アンテナOFFは背景で停止、ONは継続を試みます。自動画中絵は初期OFFで、ON時は動画のみ、音楽も含める選択肢があります。Androidで非表示・アンテナOFF・PiP非稼働のとき、実装対象の外部再生／前後曲や自動再生を抑止しています。PiP稼働中は再生操作を許可する試作です。ゲーム中は記録保護を優先します。
- 音量＋／－、再生・一時停止、次／前を画面内・通知・ロック画面・Bluetoothで扱うことが目標です。Shokz OpenRun Pro 2は多機能ボタン1／2／3回＝再生・一時停止／次／前、音量は＋／－を想定し、実機でAndroidに届くイベントを確認します。アプリ側でクリック数を重ねて解釈する方針ではありません。
- Media3段階Aは、既存WebViewを再生主体とした `MediaSessionService`／`SimpleBasePlayer` 等の橋渡しを候補にしています。**サービスだけでWebViewや再生主体の生存は保証できません。** 必要に応じて段階BのFXなし聴取専用ExoPlayerを検討する案はありますが、決定・導入はしていません。

## 優先して見ていただきたい点

### 1. 現行の再生・背景・PiPの正しさ

`js/apk-background.js`、`js/fx-dock.js`、`js/media-player-mode.js`、`js/library.js`、`js/media.js`、`android/app/src/main/java/com/trk/agrg/MainActivity.java`・`TrkDevicePlugin.java` と該当テストを確認してください。

- `visibilitychange` の捕捉順・`stopImmediatePropagation`、PiP稼働通知と画面の可視性の順序、PiP終了／前景復帰、1.5秒フォールバックと古いタイマーの競合。OSやWebViewによって前提が成立しない場合は、その条件も示してください。
- アンテナOFF／ON、PiP開始待ち／稼働中／終了、ロック・復帰、選曲／読込中、ゲーム中の組合せで、音が意図せず鳴る・止まる・再開する経路。Media Sessionのplay/pause/前後/seek、プレビュー、リピート、読込完了を含め、対象外の経路も確認してください。意図した仕様自体に問題があれば仕様上の論点として分けてください。
- 逆再生のWeb Audioと `video` の状態、システム一時停止、非同期デコード／AudioContext再開のキャンセル・世代管理、曲変更・PiP終了時の競合。二重発音や停止後の遅延再開が起こり得るか。
- 通常の曲順・シャッフル／リピート、ゲームのpause/resume、前景操作、Web／PWAへの副作用。テストが実際のモジュール連携・イベント順・負荷をどこまで再現できているか。

### 2. 現行のWeb Media Sessionの状態同期

- 曲選択・読込成功／失敗・別曲への連続切替、タグの遅延、`play`／`pause`／`seeked`／`ratechange`／`ended` で、メタデータ・位置・再生状態が別の曲と混ざらないか。`js/fx-dock.js` と `js/media-player-mode.js` の双方がMedia Sessionへ書き込む順序も含めて確認してください。
- `setPositionState` の無効値・例外・非対応API、読み込み中の解除、終了・逆再生・シーク・速度の表現。WebViewやOSの仕様に依存する点は、実機観測とコード上の推論を区別してください。
- 通知やイヤホンからの同時・重複命令、遅延した命令の完了、状態の食い違い。現在のJS側テストはVM／jsdomやモックであり、音声やOSのメディアキーを証明しません。

### 3. Media3導入の設計判断

- 段階AのWebView＋MediaSessionService＋SimpleBasePlayerは、現在の再生・FX・ゲーム同期と矛盾せず成立するか。Player状態・タイムライン／キュー・準備中・再生失敗・前後曲・シークの公開、JSへの命令の非同期応答、状態バージョンやタイムアウト・切断時の扱いを、必要な範囲で具体化してください。
- Android側MediaSessionとChromium／Web Media Sessionの二重セッション・二重イベント、controller認可、サービス／Activity／WebViewの寿命やrenderer停止を確認してください。WebViewが使えない場合に誤って「再生中」と表示したり再生を勝手に復元したりしない設計を検討してください。
- `mediaPlayback` foreground service、Android 12以降の開始制限、Android 14以降の権限、通知の権限例外、Audio Focus、通話／他アプリ／イヤホン切断への対応を、適用OS・前提条件と公式根拠を示して評価してください。不要なBluetooth権限や、不明な場合の常駐を勧めないでください。
- 必要な場合の段階Bについて、IndexedDB内File／BlobとSAFの `content://` URI、権限失効、シーク、Web Audio／FX・映像・譜面同期、切替時の音量・同時発音・戻し方のトレードオフを示してください。FXが変わる切替を無断で行わないこと。

### 4. 試験と配布上の見落とし

- `tests/apk-*.test.mjs`、`android/app/src/androidTest/`、`.github/workflows/`、実機チェック表を読み、導入前に必要な回帰テスト、最小のエミュレーター試験、物理端末でしか確認できない試験を優先順位付きで提案してください。API 35の明示的なPiP開始試験はありますが、動画・音声・自動PiP・Bluetoothの検査ではありません。過去のエミュレーターCI失敗はHANDOFF参照。
- 依存物のライセンス、推移依存・NOTICE、ユーザーデータとログ、署名・デバッグAPKの更新、端末移行や既存利用者への影響を確認してください。AndroidX Media3はApache License 2.0、まだ未導入です。初音ミク二次創作・東方素材などの権利確認は別途必要です。

## 返答の形式

1. **重大度順の指摘**：各項目に重大度（致命的／高／中／低）、確信度、対象ファイル・行、再現条件、期待／実際、影響、最小の改善案、必要な試験を書く。確認できた事実と仮説・要実機確認を明確に分ける。
2. **Media3へ進む前の判断**：今すぐ修正すべき点、実機で確認する点、後段でもよい点、段階Aの可否と前提。該当がなければ無理に欠陥を作らず、その旨を記載する。
3. **次の小さな実装・試験順序**：既存FX・ゲーム・Web版を守り、元に戻せる段階に分けて提案する。
4. 調査の限界と参照した一次資料。ソース・実機・OS仕様を確認できなかった場合は推測で埋めず、そのまま明記する。

既存のUI・利用者データを無断で削除すること、Media3を追加するだけで背景継続やBluetooth対応が完成すると断定することは求めていません。
