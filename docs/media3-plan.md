# Android再生・Media3検討（2026-10-29）

## 目的と現状

音量＋／－、再生・一時停止、次／前の曲を、画面内だけでなくBluetoothヘッドセット・通知・ロック画面から操作できることを目指す。Shokz OpenRun Pro 2の[公式ガイド](https://shokz.com/blogs/guides/openrun-pro-2-using-guides)では、多機能ボタン1回が再生／一時停止、2回が次、3回が前、音量は＋／－。機器側の操作やAndroidへの実際のイベントは機種・OSで確認する。

現在の再生主体はWebViewの `core.video` とWeb Audio／trk FX、MIDIやゲームとの連携。`js/media-player-mode.js` はWeb Media Sessionの再生・停止・前後等を登録しているが、Android WebView、通知、Bluetooth、ロック中の動作は**未検証**。今回、Web Media Sessionの重複play/pauseが逆動作しないようにし、Activityの端末音量キーをメディア音量に関連づけた。イヤホン操作やバックグラウンド再生の完成を意味しない。Bluetoothの接続・機器管理をアプリが行う実装はなく、不要なBluetooth権限は追加しない。

## 今回の準備：Web側の状態同期

Media3は追加せず、既存Web Media Sessionの情報を整理した。プレイヤー画面を閉じても、再生・停止・シーク完了・速度や長さの変更などを受けて位置を更新する。曲切替／再読込時は旧曲の位置を消し、新しいメディアの準備完了までは位置を公開しない。現在の曲のタグ取得後や再生開始時には、プレイヤーと同じ表示名へ更新する。APIが使えない場合や失敗時も再生を止めない。位置の更新はイベント駆動で、閉じた画面用の常時ポーリングは追加しない。

AndroidではアンテナOFF・非表示・PiP非稼働のとき、Web Media Session経由の再生や前後曲を抑止し、停止とシークは許可する。選曲中に背景へ移った後の自動再生も対象箇所で抑止する。PiPの許可予定ではなく実際の稼働状態を使う。逆再生の一時停止は通常再生へ切り替えず、非同期準備の古い完了も無効にする。

逆再生は準備中をpaused、映像または音声の逆再生中をplayingとして同期し、通常の位置予測が誤るため逆再生中の位置はクリアする。詳細と未実装のrenderer復旧・イヤホン切断対策は[レビュー対応記録](MEDIA3-REVIEW-FOLLOWUP-2026-10-29.md)を参照。これはWebView側の情報整備にとどまり、Androidが通知・ロック画面・Bluetoothへ反映すること、WebView停止後の継続やシーク精度は保証しない。逆再生の外部表示も実機未検証。Media3導入時は、少なくとも曲ID・表示名・準備状態・再生／一時停止・位置／長さ・速度と、命令の成功／失敗を明示的に同期し、読み込み中や停止中の古い値を出さない設計が必要。キューやゲーム状態の扱いも別途設計する。

## ライセンス

AndroidX Media3は **MITではなくApache License 2.0**。公式[ライセンス](https://github.com/androidx/media/blob/release/LICENSE)と、採用する各ライブラリ・推移依存のライセンスを確認し、配布時にライセンス文・必要なNOTICEを同梱する。GPL-3.0-or-laterとの組合せは一般に可能だが、素材の権利や最終配布条件は別に確認する。ライブラリはまだ追加していない。

## 推奨構成と未解決点

Androidの[公式ガイド](https://developer.android.com/media/media3/session/background-playback)に沿い、長期的には `MediaSessionService` に再生主体と単一の `MediaSession` を置き、UIやシステム、Bluetoothの命令を同じキュー・状態に通す。再生／停止の冪等性、曲の変更・再生位置・シャッフル／リピート・前後の意味、同時の入力、通知表示を揃える。対応形式、既存trkプレイリスト、各種FXとゲーム移行は失わないこと。

ただし、Media3を追加するだけではWebViewのIndexedDB内File／Blobをそのままネイティブプレイヤーが再生できない。現行FXはWeb Audio側で動くため、単純にExoPlayerへ切り替えるとFX・解析・MIDI・譜面や映像同期が変化し得る。バックグラウンド時に別プレイヤーへ切り替えるならURIの有効期間、権限、位置・状態、同時発音、エフェクト、失敗時の復帰が必要。可能ならSAFによる永続 `content://` URIと再生主体の一本化を設計し、非対応曲は現行方式を保護する。利用者に無断で音が二重になったり効果が消えたりしないようにする。

段階Aの候補は、WebViewを再生主体のまま維持し、Media3の `MediaSessionService` と `SimpleBasePlayer` で状態・命令をJSと中継すること。既存FX・解析・譜面同期を守りやすいが、WebView／プロセスが停止すれば再生主体は残らず、**それだけでは安定したバックグラウンド再生にならない**。WebViewのMedia SessionがBluetoothや通知に橋渡しされない端末では、現行のWeb側修正は外部操作に効かない可能性がある。実機で検証し、不足する場合に限り段階BとしてFXなしの聴取専用ExoPlayerを検討する（全面移行はしない）。切替の同時発音や状態消失は防ぐ。

段階Aを実装する前に次を検証する。

- mediaPlayback型foreground serviceとAndroid 14以降の `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 権限、通知、Android 12以降の背景起動制限。アンテナONでアプリ前面から再生開始した時点を候補とし、開始／停止と失敗時の整合性を設計する。[Android公式の再生サービス](https://developer.android.com/media/media3/session/background-playback)。
- メディアセッション通知の通知権限例外を確認しつつ、通知の見え方・制御はOSごとに試す。Google Play配布時はforeground service種別の申告も確認する。
- Chromium側セッションとの競合、コントローラー認可、Activityとサービスの寿命、JS中継の未応答・状態遅延・回復時の整合性。WebView rendererの優先度設定は効果とメモリ負荷を実測し、設定だけで生存が保証されるとはみなさない。
- アプリが終了・強制停止された後に再開するかは利用者と決定する。サービスやWebViewが失われたとき、勝手に大音量で再生を復元しない。

採用方法は実機・互換性の検証後に決め、未確認のforeground serviceを先に常駐させない。

## 設計・検証の受け入れ条件

- 通常時の音量はAndroidのメディア音量／Bluetooth側に任せ、アプリ内の楽曲音量やFXゲインを勝手に変更しない。両者は独立。端末の音量キーはActivityで `STREAM_MUSIC` に関連づけた。Bluetooth絶対音量や固定音量機器はAndroidと機器側の挙動に依存する。参照：[Androidの音量と出力](https://developer.android.com/media/platform/output)。
- 再生・一時停止、前／次を通知・ロック画面・Shokzで確認。現在のキュー・シャッフル・リピートと整合し、重複イベントで反転しない。Shokzは機器側でクリック数を処理するため、同じイベントをアプリ側で二重に多重クリック解釈しない。現在の前曲動作はプレイヤーの `stepMedia(-1)` に沿い、先頭に戻す閾値等を後から勝手に変えない。
- [Audio Focus](https://developer.android.com/media/optimize/audio-focus) を要求・解放し、他アプリや通話による中断、端末切断によるスピーカーへの突然の出力、接続復帰・複数端末を確認する。勝手に再開・大音量化しない。
- Androidのforeground service種別、権限、通知、バックグラウンド起動制限、セッションのcontroller認可、プロセス終了・再起動、権限喪失の扱いを実装前に確認する。アプリが閉じた後の再生・再開も仕様を明示する。
- アンテナOFFはバックグラウンドで一時停止。ONは継続。PiP（初期OFF、動画のみ／音楽も）との優先関係、PiP終了時、操作中のゲームの一時停止、画面回転を統合する。現状の挙動は試作・未検証。
- SDK/JDK環境でビルドし、自動テストに加えてAndroid各バージョンの実機、特に **Shokz OpenRun Pro 2** で音量＋／－・1回／2回／3回、通知・ロック・他アプリ・通話・切断を確認する。WebViewモックや単体テストだけではイヤホン対応を保証しない。
