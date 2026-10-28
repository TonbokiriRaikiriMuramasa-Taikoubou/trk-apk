# Android再生・Media3検討（2026-10-29）

## 目的と現状

音量＋／－、再生・一時停止、次／前の曲を、画面内だけでなくBluetoothヘッドセット・通知・ロック画面から操作できることを目指す。Shokz OpenRun Pro 2の[公式ガイド](https://shokz.com/blogs/guides/openrun-pro-2-using-guides)では、多機能ボタン1回が再生／一時停止、2回が次、3回が前、音量は＋／－。機器側の操作やAndroidへの実際のイベントは機種・OSで確認する。

現在の再生主体はWebViewの `core.video` とWeb Audio／trk FX、MIDIやゲームとの連携。`js/media-player-mode.js` はWeb Media Sessionの再生・停止・前後等を登録しているが、Android WebView、通知、Bluetooth、ロック中の動作は**未検証**。今回、Web Media Sessionの重複play/pauseが逆動作しないようにし、Activityの端末音量キーをメディア音量に関連づけた。イヤホン操作やバックグラウンド再生の完成を意味しない。Bluetoothの接続・機器管理をアプリが行う実装はなく、不要なBluetooth権限は追加しない。

## ライセンス

AndroidX Media3は **MITではなくApache License 2.0**。公式[ライセンス](https://github.com/androidx/media/blob/release/LICENSE)と、採用する各ライブラリ・推移依存のライセンスを確認し、配布時にライセンス文・必要なNOTICEを同梱する。GPL-3.0-or-laterとの組合せは一般に可能だが、素材の権利や最終配布条件は別に確認する。ライブラリはまだ追加していない。

## 推奨構成と未解決点

Androidの[公式ガイド](https://developer.android.com/media/media3/session/background-playback)に沿い、長期的には `MediaSessionService` に再生主体と単一の `MediaSession` を置き、UIやシステム、Bluetoothの命令を同じキュー・状態に通す。再生／停止の冪等性、曲の変更・再生位置・シャッフル／リピート・前後の意味、同時の入力、通知表示を揃える。対応形式、既存trkプレイリスト、各種FXとゲーム移行は失わないこと。

ただし、Media3を追加するだけではWebViewのIndexedDB内File／Blobをそのままネイティブプレイヤーが再生できない。現行FXはWeb Audio側で動くため、単純にExoPlayerへ切り替えるとFX・解析・MIDI・譜面や映像同期が変化し得る。バックグラウンド時に別プレイヤーへ切り替えるならURIの有効期間、権限、位置・状態、同時発音、エフェクト、失敗時の復帰が必要。可能ならSAFによる永続 `content://` URIと再生主体の一本化を設計し、非対応曲は現行方式を保護する。利用者に無断で音が二重になったり効果が消えたりしないようにする。

暫定案としてMedia3の `SimpleBasePlayer` でWebViewに操作だけ中継する方法もあるが、WebView／プロセスが停止すれば再生主体は残らず、**それだけでは安定したバックグラウンド再生にならない**。Androidが生成する通知やChromiumの既存Media Sessionと競合しないこと、通知・コントローラーのアクセス制御も必要。採用方法は実機・互換性の検証後に決め、未確認のForeground Serviceを先に常駐させない。

## 設計・検証の受け入れ条件

- 通常時の音量はAndroidのメディア音量／Bluetooth側に任せ、アプリ内の楽曲音量やFXゲインを勝手に変更しない。両者は独立。端末の音量キーはActivityで `STREAM_MUSIC` に関連づけた。Bluetooth絶対音量や固定音量機器はAndroidと機器側の挙動に依存する。参照：[Androidの音量と出力](https://developer.android.com/media/platform/output)。
- 再生・一時停止、前／次を通知・ロック画面・Shokzで確認。現在のキュー・シャッフル・リピートと整合し、重複イベントで反転しない。Shokzは機器側でクリック数を処理するため、同じイベントをアプリ側で二重に多重クリック解釈しない。現在の前曲動作はプレイヤーの `stepMedia(-1)` に沿い、先頭に戻す閾値等を後から勝手に変えない。
- [Audio Focus](https://developer.android.com/media/optimize/audio-focus) を要求・解放し、他アプリや通話による中断、端末切断によるスピーカーへの突然の出力、接続復帰・複数端末を確認する。勝手に再開・大音量化しない。
- Androidのforeground service種別、権限、通知、バックグラウンド起動制限、セッションのcontroller認可、プロセス終了・再起動、権限喪失の扱いを実装前に確認する。アプリが閉じた後の再生・再開も仕様を明示する。
- アンテナOFFはバックグラウンドで一時停止。ONは継続。PiP（初期OFF、動画のみ／音楽も）との優先関係、PiP終了時、操作中のゲームの一時停止、画面回転を統合する。現状の挙動は試作・未検証。
- SDK/JDK環境でビルドし、自動テストに加えてAndroid各バージョンの実機、特に **Shokz OpenRun Pro 2** で音量＋／－・1回／2回／3回、通知・ロック・他アプリ・通話・切断を確認する。WebViewモックや単体テストだけではイヤホン対応を保証しない。
