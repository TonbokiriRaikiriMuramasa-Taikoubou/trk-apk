# Android APKの配布準備

2026-10-29時点。現状は **開発版 `0.1.0-dev`** で、署名済みの正式配布版は未作成。READMEのActions成果物は7日間のdebug APKであり、恒久的な配布用署名ではない。この文書は配布のための手順とチェックリストであり、実機・権利・署名済みAPKの合格記録ではない。

## 1. 試験用debug APK

[README](../README.md#androidで試すdebug-apk)から取得・インストール。Actionsはコミットごとに `app-debug.apk` と `SHA256SUMS.txt` を成果物に含める。ZIPはAPKそのものではないので展開する。debug鍵は異なるランナー間で変わり得る。署名が違うとAndroidは同じアプリIDに上書きできず、削除するとアプリデータが消える。必要なデータを別途確保し、実機で復元できるか事前確認する。

## 2. 署名済みAPKを作る前に

- [ ] 配布する正確なGit commit、変更のないソースとビルド環境を決める。`npm ci`、`npm run check`、`npm run cap:sync` を実行し、その後 `android/` をAndroid Studioで開く。Node.js 22以上、JDK 21、Android SDK 36が必要。[開発ガイド](apk-development.md)を参照。
- [ ] 仮ID `com.trk.agrg` を正式に採用するか決定。`android/app/build.gradle` の `applicationId`、`versionName` と、更新ごとに増やす `versionCode` を管理する。同じID・互換署名がなければ通常の上書き更新はできない。ID変更は別アプリとして扱われるため、既存データの移行を別途検討する。
- [ ] 自分で管理する**配布用の署名鍵**を安全に作成・保管し、復旧可能なバックアップと利用者・管理者の引継ぎ方法を定める。鍵・パスワードはGit、APK、公開ログ、チャットに入れない。紛失・変更は以後の更新に影響する。Google Play App Signingを使う場合は配布鍵とアップロード鍵の管理も別途確認する。
- [ ] [NOTICE](../NOTICE.md)、[LICENSE](../LICENSE)、[プライバシー](../privacy.html)および素材・推移依存の条件を確認。個人・非営利やGPLの存在だけで第三者素材の再配布権は確定しない。配布先規約、同梱物、ライセンス・必要なNOTICEと、GPLに対応した**そのAPKに対応するソースの提供方法**を確認する。リポジトリと配布バイナリの対応commitを明記する。
- [ ] [実機チェック表](ANDROID-DEVICE-CHECKS.md)を実行。特に初回起動、インストール・更新、タッチ、再生・FX、ゲーム、書斎、ファイル選択、データ保存・復元、回転、PiP、背景、イヤホン切断・Bluetoothを確認。エミュレーターの成否を物理端末の合格に置き換えない。

## 3. Android Studioで署名付きAPKを作る

1. 上記チェックと `npm run cap:sync` の後、Android Studioで `android/` を開く。
2. **Build → Generate Signed Bundle / APK**（Studioの版により名称が異なる）を選び、**APK** を選択する。
3. 配布用keystoreとkey aliasを指定する。初回は安全な場所に作成し、パスワードはStudioに直接入力する。リポジトリや生成Web資産内に置かない。
4. `release` を選択し、出力先と署名設定を確認してビルド。生成先はウィザード／完了通知の表示で確認する。通常の `assembleRelease` は、このリポジトリでは配布用署名を設定しておらず、それだけでインストール可能な署名済みAPKになるとは限らない。
5. 生成物について、SDK Build Toolsの `apksigner verify --verbose --print-certs <APKのパス>` が成功することを確認し、証明書のSHA-256フィンガープリントを記録する。`sha256sum <APKのパス>` でAPKのハッシュも記録し、信頼できる別経路で照合できるようにする。署名後にAPKを変更しない。
6. 実機でインストール・起動を確認し、同じ配布鍵による更新、データ保持とバックアップ／復元も試す。debug APKからの署名変更による上書きは通常できない。結果を機種・OS・commit・APKハッシュと一緒に記録する。

## 4. 配布時に添える情報

版・commit・APKのSHA-256・署名証明書のフィンガープリント、対応Android、インストール・更新・アンインストール時の注意、既知の制限、ライセンス・NOTICE・対応ソースの入手先、問い合わせ先を案内する。配布物を第三者が受け取れる場所は別途決める。GitHub Actionsの期限付き成果物を正式な配布先として扱わない。Google PlayはAPKと異なる提出形式や署名・ポリシー要件があるため、公開時の要件を別途確認する。

## 5. 現時点の制約

物理Android未検証。Media3再生サービス・Audio Focus統合、ネイティブSAF永続フォルダ、共有インテント受信は未実装。PiPや背景再生はOSにより停止し得る。自動バックアップとAndroid 12以降のクラウド／端末間転送は除外設定だがメーカー固有の動作は未確認。利用者のデータ保全は最優先とする。
