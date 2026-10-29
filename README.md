# trk! Android版（開発中）

trk 1.1.4／trk214 を基に、PC版1.1.5〜1.1.7の一部を取り込んだ、音楽・動画プレイヤーとリズムゲームのAndroid版です。**開発中であり、正式版は未配布です。** GitHub Actionsで開発用debug APKのビルドは成功しましたが、Android実機での動作は確認していません。

下部ナビは「ライブラリ／エフェクト／再生／書斎／ゲーム」。音楽や動画からエフェクトを調整し、選択中の曲で譜面を作って遊ぶ流れを目指しています。上流の内蔵モーション65種も残しています。

## 今できること・注意

- ファイル取込はライブラリの「コンテンツを追加」にあります。ただし Android WebView のファイル選択や永続保存は実機未確認です。SAFの永続フォルダ取込・MediaStoreの自動取得は未実装です。
- Lat式ミクのモデルは同梱せず、[作者の配布先](https://bowlroll.net/file/30199)をご案内します。各自でReadMeと利用条件を確認してください。Androidでのモデル取込・表示は未検証です。
- Androidの共有メニューからの受信は**未実装**です。Web/PWA版の share_target は APK では使えません。
- タイトル右上のアンテナで、裏画面での再生継続（試行）／一時停止を切り替えられます。画中絵はプレイヤー内で設定（初期オフ、動画のみ／音楽も表示）。いずれもAndroid実機未検証で、OSにより停止する場合があります。Media3の再生サービス・確実な通知操作は未実装です。
- Androidの右下ボタンは現在の画面向きの固定／解除です（初期は端末設定に従う）。**10秒長押し**で緊急復帰の確認を出せます。固定はアプリ内の一時的な操作で、回転や端末設定との挙動は実機未確認です。
- 設定の「🐔 trk's playlist」から、必要なリストだけ追加できます。紹介カタログは音源を含みません。シンセは初期オフです。
- `assets/optional-demo-audio/` の FIRST SPARK は任意のデモです。不要ならビルド前にフォルダー全体を削除できます。チュートリアルは「スキップ」で閉じられます（English: Press **Skip**）。
- trk's OST Vol.1 は別配布の [music-library](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/music-library) の `trk-ost-vol1.stpack` をアプリ内から選択します。音源・各素材の条件は [NOTICE](NOTICE.md) を確認してください。

## Androidで試す（debug APK）

**試験用です。** 対応範囲はAndroid 7.0（API 24）以上ですが、実機での動作は未確認です。背景再生・データの保持や復元は保証できません。大切なデータだけを入れて使わないでください。

1. [Android debug build のActions一覧](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/workflows/android-debug.yml)で、目的のブランチとcommitの **成功した実行**を選びます。実行ページの **Artifacts** から `trk-apk-debug-<commit>` をダウンロードし、ZIPを展開します（GitHubへのログインが必要な場合があります。保存期限は通常7日）。
2. `app-debug.apk` と同梱の `SHA256SUMS.txt` を確認します。PCで展開したフォルダーから `sha256sum -c SHA256SUMS.txt` を実行すると照合できます。SHA-256は破損確認であり、入手元や署名の信頼性の証明ではありません。
3. Android端末にAPKを移し、信頼できるファイル管理アプリ等から開いてインストールします。OSが求める場合は、そのアプリに限って「不明なアプリのインストール」を許可し、終了後に戻してください。許可の名前や手順は端末により異なります。
4. 起動後、ライブラリの「コンテンツを追加」から自分のファイルを選びます。まずは少量で試してください。エミュレーターでの一部検査はありますが、ファイル選択や永続保存は実機未検証です。

**更新前の注意：** Actionsのdebug署名鍵はビルドごとに変わる場合があり、上書き更新できないことがあります。アンインストールするとアプリ内データが消えるため、先に必要なデータを別途保存してください。設定の「全設定を書き出し」はすべての利用者データや端末内ファイルを保証する完全バックアップではなく、Androidでの書き出し・読み戻しも未検証です。

正式配布向けの署名・バージョン管理・権利確認は未完了です。[APK配布準備ガイド](docs/APK-DISTRIBUTION.md)に署名済みAPKの作成手順と確認事項をまとめています。現時点で正式な配布版を公開したという意味ではありません。

## 開発・ビルド

Node.js 22以上、JDK 21、Android Studio、Android SDK 36 が必要です。

```sh
git clone https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk.git
cd trk-apk
npm ci
npm run check
npm run cap:sync
npm run cap:open:android
# またはAndroid SDK/JDKを設定後
cd android && ./gradlew assembleDebug
# 結果: app/build/outputs/apk/debug/app-debug.apk
```

`android/` は生成済みなので `cap:add:android` は再実行しません。ビルド前に署名・権利・アプリIDを確認してください。手順と未検証事項は [開発ガイド](docs/apk-development.md) と [HANDOFF](docs/HANDOFF.md) にあります。上流のWeb版配布手順は [上流の引き継ぎ](docs/HANDOFF-UPSTREAM-trk214.md) に保存しています。

## 情報・報告

- [プライバシー](privacy.html) · [権利・クレジット](credits.html) · [パック形式](docs/pack-format.md)
- [セキュリティ](docs/SECURITY.md) · [SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md) · [QUALITY-CHECKS.md](docs/QUALITY-CHECKS.md)
- Android版の問題は [このリポジトリのIssues](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/issues) へ。公開の場には個人情報を載せないでください。
- ソースは GPL-3.0-or-later（[LICENSE](LICENSE)）。第三者のモデル、画像、音源には個別の条件があります。
