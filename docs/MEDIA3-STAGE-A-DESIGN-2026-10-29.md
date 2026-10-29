# Media3段階A：WebView橋渡しの設計案（2026-10-29）

**設計案のみ。製品アプリへのMedia3、サービス、Audio Focus、以下の通信方式はいずれも未実装・未検証。** Android計測テスト専用に `media3-common` を使用する試験を追加したが、サービスや実再生には接続しない。 既存のWebViewを唯一の音声・映像再生主体とし、FX・解析・ゲームを維持する。Media3サービスは外部操作の仲介者であり、ExoPlayerを同時に動かさない。サービスを加えてもWebViewやプロセス停止後の音声継続は保証できない。既存の[Media3計画](media3-plan.md)、[レビュー対応](MEDIA3-REVIEW-FOLLOWUP-2026-10-29.md)、[実機チェック](ANDROID-DEVICE-CHECKS.md)と併用する。

## 責務と一貫性

- Web側が既存trkの曲選択、実再生状態、プレイリスト順、シャッフル／リピート、前後曲の意味、FX、ゲームを所有。ネイティブは単一の `MediaSessionService`／`MediaSession` とPlayerアダプター、コントローラー認可、Audio Focus・通知を担当する候補。現状のWeb Media Sessionと二重公開・二重操作にならない切替を先に実験する。ChromiumがOSに何を公開するかは端末別に検証し、単にWeb APIを消せばセッションが一つになると仮定しない。Web／PWAのWeb Media Sessionは維持する。
- JSへの命令はアプリ内の明示的なBridgeで配送し、セッションの応答と実再生の成功を区別する。Activity・Bridge不在時に古いWebView参照を使わない。JS／renderer不在で新たなWebViewやActivityを裏から勝手に立ち上げて再生しない。処理はPlayerのapplication threadへ直列化し、WebView操作はその要件に従う。
- `SimpleBasePlayer` は候補であって採用確定ではない。[公式ソース](https://github.com/androidx/media/blob/release/libraries/common/src/main/java/androidx/media3/common/SimpleBasePlayer.java)は `getState()` と対応コマンド、非同期ハンドラーのFuture、外部状態変更時の `invalidateState()` を要求する。また非同期処理中に推定した仮状態を表示しうる。単にFutureを未完了にすれば誤った再生表示を防げるとは限らない。利用する固定バージョンで挙動を検証し、安全状態と矛盾する仮表示が防げない場合は別のアダプター設計を選ぶ。コードは現在 `@UnstableApi` であり、依存バージョン更新時に再検証する。

## 状態の提案

各Bridge接続に変更不能な `epoch`、Web側の単調増加 `revision`、各曲読込に `loadGeneration` を割り当てる。ネイティブは同じepochの新しいrevisionだけを採用し、再接続時は完全なsnapshotを受け取る。曲IDはtrkの既存IDを基準とし、ファイル名や同名曲をIDとしない。個人の絶対パスやBlob URLは公開メタデータへ含めない。以下は概念モデルであり確定したJSON・Media3マッピングではない。

| 値 | 提案と制約 |
| --- | --- |
| 接続 | `available`／`unavailable`。失効したepochの結果・イベントは無視し、利用不可ではplayingと表示しない。 |
| 曲とキュー | 現在曲の安定ID・表示名・必要なメタデータ、順序と現在位置、repeat／shuffle。ID解決不能や読込中は旧曲の位置を消す。巨大リストの全送信・更新頻度・公開範囲は試作で決める。 |
| 再生 | `idle`／`loading`／`ready`／`ended`／`error` と、実際の再生・停止、再生意図、背景／切断／復旧ガードを別々に扱う。意図だけでplayingと確定しない。ガード中に別経路のコマンドで解除しない。 |
| 位置 | 曲とgenerationに紐づく有限な位置・長さ・速度のみ。有効な時だけ公開し、読込中・情報不明時は旧値を再利用しない。逆再生中は正方向への自動補間をさせず、Media3で未知または安全な表現が可能か先に確認する。 |
| エラー | 種別と回復可能性。実ファイルや個人情報を公開しない。メディア未準備、再生拒否、Bridge消失、タイムアウトを区別し、失敗を成功としてackしない。 |

実際のMedia3 `STATE_*`、`playWhenReady`、suppression、timeline、位置の未知値にはAPI上の制約がある。表の値を無条件に一対一対応させず、空キュー、duration不明、逆再生、ゲーム時を含む有効な組合せのテストを先に作る。曲位置の補間・タイマーはWebViewとOS制限の下で精度を保証しない。

## 命令と競合

1. 段階A最初の候補は `play`、`pause`、`next`、`previous`。`play` と `pause` は冪等、次／前は既存trkの挙動を呼び出す。端末が処理した多重クリックをアプリが再解釈しない。音量はOSのメディア音量に任せ、trkのFX／楽曲ゲインを変えない。seek・repeat／shuffle・キュー編集は実装と状態同期を試験できるまでavailable commandsに含めない。
2. 各命令に `epoch`、一意な `commandId`、発行時のガード世代を付ける。JSは受理と非同期完了を区別し、結果と新しい状態を返す。重複IDは二重実行しない。次／前の連続入力は重複とみなさず順序を維持する。保管期限や重複排除表の上限は実装時に決定する。
3. pause、切断、Audio Focus喪失、renderer終了、背景禁止、サービス破棄は優先的に再生を止め、進行中のplay／選曲・decodeを世代で無効化する。後からガードを明示解除しても、古い命令の遅延完了は再生しない。切断後は再接続だけで再開しない。ゲーム中やアンテナOFFの背景では既存ルールを尊重し、PiPは実稼働を判断する。
4. 応答期限は機器を測定して決める。期限切れ・Bridge消失時は保留命令を失敗として整理し、ネイティブ表示を安全側へ戻す。タイムアウトはWeb側停止成功を意味しない。再接続後は新epochの実状態を受信し、期限切れのplayやnextを再送しない。Web側が無応答の場合に音声を確実に停止できるとは限らない。
5. 復旧直後・切断後・プロセス再作成後に、OSからの古いコマンドやキャッシュだけで音を再開しない。実際の外部ユーザー操作を明示再開とみなせる条件、認可、復旧ガード解除は実装前に定義・テストする。プロセス終了後の自動再開仕様は未決。

## テスト専用モデルでの検討

`tests/helpers/media3-stage-a-model.mjs` と `tests/media3-stage-a-model.test.mjs` は、偽Web再生主体・偽ネイティブ表示・手動時計による**設計検討用モデル**。アプリにもAPKにも組み込まず、実際のMedia3・Bridge・音声・OSを実装／検査したものではない。実行例は `node --test tests/media3-stage-a-model.test.mjs`。固定の3曲キュー等は仮のfixtureであり、trkの実際のキューや前後曲の仕様ではない。

モデルでは、新epochを使う再接続、revision・generationの古い応答の拒否、命令IDの重複排除、再生／停止の冪等性、次曲命令の順序、pause・切断後の古い非同期処理取消、期限切れ、矛盾するsnapshotの拒否を検査した。重複排除表が一杯なら新規命令を拒否する保守的な仮定を置き、古いIDを安全性の根拠なく削除しない。これは実用的な容量・期限・再接続設計が決まったことを意味しない。停止要求自体が配送できない場合、JSの停止は保証できない。

**重要な反例**：Web側が期限前に再生を開始し、応答だけが遅れた場合、ネイティブのタイムアウトで表示を停止・接続を無効化しても、Web側では音が続き得る。取消や停止を送っても、JSが凍結・終了していれば到達は保証できない。モデルの手動時計・同じ期限値・協調的な取消は実機で保証されておらず、時計の基準、配送順、実際のPlayerの仮状態、JS停止を強制できるか、通信断中の安全策を別途設計・測定する。WebViewに再生主体を残す案の制約として扱い、タイムアウトだけで消音できると主張しない。

## 実ライブラリでの契約検査（API 35エミュレーター）

Android計測テストだけで Apache-2.0 の `androidx.media3:media3-common:1.11.1` を固定し、実 `SimpleBasePlayer` と未完了Futureを使って、仮のplaying表示と `invalidateState()` のタイミングを確かめる試験を追加した。音声、セッション、サービス、Bridgeは作らない。依存は `androidTestImplementation` のみで、CIはアプリのdebug runtime依存にMedia3が混入していないことも検査する。[API 35エミュレーターCI](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40813391110)（`18c9676`）で検査とdebug runtime依存グラフの確認が成功。製品への採用・バージョン決定は別途行う。

[同バージョンの公式実装](https://github.com/androidx/media/blob/1.11.1/libraries/common/src/main/java/androidx/media3/common/SimpleBasePlayer.java)上、標準のplaceholderは操作成功を先読みする。`getPlaceholderState()` を上書きできる一方、保留中は `invalidateState()` を呼んでも即時には反映されず、保留操作がすべて終了するまで状態更新が遅れる。試験では、未完了のplayが既定placeholderで `isPlaying=true` となり、失敗で確認済み状態に戻った。確認済み状態を返すplaceholderなら未確認のplay表示を避けられたが、逆にpause保留中に実際の状態を停止へ変え `invalidateState()` しても、Future完了まで `isPlaying=true` のままだった。緊急停止の反映と保留Futureの整理を設計せずに、単にplaceholderを上書きすれば安全になるとは考えない。ライブラリは `@UnstableApi` のため、採用候補を変えた際も同じ検証が必要。

### 優先停止・古い応答の試作検査（CI実行待ち）

テストAPK内だけの `SafetyProjectionPlayer` で、遮断フラグとgenerationを先に変更し、保留Futureを整理して表示を `STATE_IDLE`／play不可へ移す案を検査する。これは**確認済み消音ではなく、実状態不明・利用不可の表示**。停止要求の実配送、タイムアウト、時刻、実WebView・Bridge・リモート再生は実装しない。再接続時のepoch、generation、revisionと保留命令の一致を仮定し、古い応答や重複応答が新しい命令を完了させないことを確認する。認可済み再開も試験用の直接操作であり、実OSコマンドの認証・自動再開対策の実装ではない。

複数Futureを逐次キャンセルする間に、そのFutureのリスナーが同期的に再入する反例も検査する。保留操作が残っていれば `SimpleBasePlayer` のcached stateはまだ古く、再入時に再生中と読める可能性があるため、フラグ変更とFutureの逐次整理だけを原子的な状態切替とみなさない。コマンド処理側でも遮断を確認し、リスナーの実行順・再入、複数保留、寿命管理を含む別の設計と検証が必要。以下の結果はCI成功まで未確認。

## サービス・フォーカス・検証順

- フォアグラウンドサービスは起動条件、通知、権限、Androidバージョン別制限を確認し、適法に開始できない場合はエラーを示して既存再生の状態と矛盾させない。Media3の通知・セッションとChromiumとの重複を実機で調べる。通知を出しただけでWebViewが生存する保証はない。
- Audio Focusは一つの所有者に絞り、WebView側・将来のnative側との二重要求やnoisy receiverの重複を避ける。通話・他アプリ、duck／一時喪失／永続喪失、切断・再接続の方針をOSバージョンごとに試す。安全に停止できない場合は自動再開せず、ユーザー操作を要求する。現行にAudio Focus統合はない。
- まず偽Bridge／偽Playerで状態妥当性、重複、順序、タイムアウト、復旧世代、仮状態を検査。次にAPI別エミュレーターでサービス・通知・renderer終了・Activity再生成・権限・ライフサイクル、最後に物理端末の有線／Bluetooth・Shokz・通話・ロック・PiP・音声・FXを確認。モック・エミュレーターを実音声やBluetoothの合格扱いにしない。
- 導入前にMedia3固定バージョンと推移依存・Apache 2.0／NOTICE、APK容量、minSdk／targetSdkとの適合を記録する。サービスが使えない場合は段階Aを無効に戻せるようにし、Web／PWAや既存機能を変更しない。段階Bのネイティブ再生主体への切替は別設計。
