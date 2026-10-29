# レビュー依頼：PC版1.1.5〜1.1.7のAndroid版への取り込み

## 対象・目的

- リポジトリ：`TonbokiriRaikiriMuramasa-Taikoubou/trk-apk`。対象は `arena/c6a5bc1b-trk-apk` の**未マージ**変更。基準のmainはPR #8の `cc244e29e60ab6b3cfa8fb6fe1919cbc0d69beab`。対象の正確なcommitとソースZIPのSHA-256は同梱の `README.txt`／`SHA256SUMS.txt` を参照。
- 変更本体は `f008412`、その後は資料の整理。差分ファイルは上記mainから対象commitまで。ZIPはGit管理のソースで**APKではない**。
- PC版 [1.1.5](https://drive.google.com/drive/folders/1j9mIFWIW5m7ZQSwXiy2OaqviT7JiXghw)・[1.1.6](https://drive.google.com/drive/folders/1S01wbrKXkGBqGPgQ7wx9PvQaHXugAada)・[1.1.7](https://drive.google.com/drive/folders/1dRkTvLFzV_q3eqaFY5UD6bbze8IkErjW) の変更を、既存のWeb/PWA・ゲーム・Android版固有の変更と利用者データを守りながら取り込む。全差分をそのまま適用したものではない。
- 詳細は [差分ごとの検討](UPSTREAM-1.1.5-1.1.7-REVIEW.md)、全体像は [HANDOFF](HANDOFF.md)、[進捗](PROGRESS-2026-10-29.md)、[次作業](NEXT-ACTIONS-2026-10-29.md)。ZIP内の `docs/` に関連資料が揃っている。

## 現在の主な判断

1. お気に入り4フォルダ（曲・TV・FX）の保存、ピン・凍結、既定3秒の解除と任意のワンタップ設定を統合。従来の1軍も維持する。
2. 新規・無効値・全設定リセットでは譜面生成B（方式4）。旧APKの保存値1〜4は、旧既定と明示選択を判別できないためすべて維持する。これは印のない旧値をBに寄せるPC版とは意図的に異なる。古い譜面・記録を再現する際の影響に注意。
3. 1.1.6の個別追加はAPKに先行実装済み。新規選択のID・100曲ごとのVol分割・追加済み判定・空リスト抑止を維持し、不要な棚を増やさない。PC版の既存カタログ自動更新や旧データ移行は、利用者による編集の保護との両立が未解決のため保留。
4. 1.1.7相当として、曲プロフィールの追加先一覧ではtrk製リストを初期非表示にし、設定で表示／非表示を切替。コピーはカタログから独立した通常リストとしてルートに置く。元リストの削除ではない。

## 特に見ていただきたい点

優先度・再現条件・対象コード・影響・修正案・必要なテストを明記してください。問題が見つからない項目と未評価項目も区別してください。

1. **データ保護・移行**：旧APKやPC版の設定／プレイリストの読み戻し、`settings.favs` と `songFav`、保存・復元・全設定リセット、部分／不正なバックアップ、活動中状態と保存値の競合。自動保存や画面再生成で古い値を復活させたりユーザーの編集を失ったりしないか。
2. **お気に入り操作**：main/sub/frozen/former間の重複・移動、ピン・ロック・抽選、3秒長押し・途中キャンセル・画面非表示・離脱時、ワンタップ設定、キーボードとアクセシビリティ。スマホで誤操作しないか。
3. **プレイリスト**：`trkListed` の保存・取込・上限、IDの判定と衝突、長いID／Vol／旧`cat`、カタログ重複、非表示にした場合に削除やアクセス不能と誤解されないか。コピーの楽曲・wish・ガイド・タグと元データの独立、200本／棚の上限、名称・棚移動、編集・再起動・削除。既存データの自動更新を将来安全に行う設計。
4. **譜面と互換性**：B既定と既存値維持の判断、旧方式選択・変更・保存／リセット・インポート、譜面生成と記録の関連付け、表示文言と4言語、ゲーム中の変更に伴う影響。
5. **Androidと既存機能**：画面幅・タッチ目標・Back／設定UI、Web/PWAのキャッシュ更新、プレイヤー／ゲーム／FX・音声遮断など既存の改修との衝突。jsdomだけのテストや文字列検査では見えないケース。
6. **検証範囲と次の段階**：不足する自動テストとAPI別のエミュレーター／実機手順、実装前に判断すべき事項。Media3の製品Bridge／サービス、Audio Focus、SAF、共有受信は未実装。テスト用Media3は製品の背景再生ではない。

## 既知の検証結果・未検証

- `f008412` の `npm run check` は809テスト／41スイート成功。`npm run cap:sync` と差分チェック成功。[debug APK CI](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40832070392)、[API 35 CI](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40832070333)成功。API 35では実WebView内のJS操作で、お気に入り2軍・ピン・凍結と譜面方式の保存／Activity再生成を検査。モック・WebView試験は実機の合格ではない。
- `133f735` は資料更新後の[debug CI](https://github.com/TonbokiriRaikiriMuramasa-Taikoubou/trk-apk/actions/runs/40832556240)成功。後続が資料のみでもCIが実行された対象commitを区別する。
- 物理タッチ、狭い画面、ゲーム操作／譜面の感触、実音声、Bluetooth、通知UI、実際のイヤホン切断、ロック・省電力は未確認。debug APKはGitHub Actions成果物（期限あり）であり、正式配布版ではない。ビルドごとにdebug署名が異なり得るので、インストール前に既存データのバックアップを確認する。
- 検証時はテスト用データを使い、既存のサイトデータ・曲・設定・記録を削除しない。音源やLat式モデル本体はソースZIPに同梱しない。
