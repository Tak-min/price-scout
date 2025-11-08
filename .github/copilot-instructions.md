承知いたしました。
構成を再度変更し、**「OCR（文字抽出）はCDN版 Tesseract.js」「テキスト理解（整形）は Gemini API」** というハイブリッド構成で `copilot-instructions.md` を再定義します。

この構成では、クライアントサイドでTesseract.jsを実行して「生テキスト」を取得し、その「生テキスト」をサーバーレス関数経由でGemini APIに送信し、整形されたJSONを受け取る流れになります。

-----

# Copilot Instructions for PriceScout (v3 - Tesseract + Gemini)

## このドキュメントについて

  * GitHub Copilot が本リポジトリのコンテキストを理解しやすくするためのガイドです。
  * 新しい機能を実装する際は、ここで示す技術選定・設計方針・ファイル構成を前提にしてください。
  * このプロジェクトは、クライアントサイドOCR（Tesseract.js）の限界を、AI（Gemini API）による後処理で補完することを目指します。

## 前提条件

  * 回答は必ず日本語でしてください。
  * コードの変更をする際、変更量が100行を超える可能性が高い場合は、事前に「この指示では変更量が100行を超える可能性がありますが、実行しますか？」とユーザーに確認をとるようにしてください。
  * 何か大きい変更を加える場合、まず何をするのか計画を立てた上で、ユーザーに「このような計画で進めようと思います。」と提案してください。

## アプリ概要

**PriceScout (プライススカウト)** は、レシート撮影で商品価格を記録し、過去の最安値をすぐに検索できるシンプルな価格管理アプリです。

### 主な機能

1.  **レシート撮影・AI OCR登録**:
      * **OCR (クライアント)**: CDN経由の Tesseract.js が画像から「生テキスト」を抽出します。
      * **テキスト理解 (サーバーレス)**: 抽出した「生テキスト」を Gemini API に送信し、文脈を理解させ、店舗名・合計金額・購入日などをJSON形式で返却させます。
      * **フォーム入力**: 返却されたJSONデータを編集フォームに自動入力します。
2.  **商品価格検索**: 登録した商品名を部分一致で検索し、結果を単位価格の安い順に表示します。
3.  **単位量換算**: 「1gあたり」「1mlあたり」などの単位量あたりの価格を自動計算します。
4.  **データ管理**: 全てのデータはブラウザの `localStorage` に保存されます。JSON形式でのエクスポート・インポート機能も持ちます。

## 技術スタック概要

### クライアントサイド (ブラウザ)

  * **言語**: HTML5, CSS3, Vanilla JavaScript (ES6+)
  * **主要ライブラリ (CDN)**:
      * `Tesseract.js`: OCR処理（画像 → テキスト）
      * `Day.js`: 日付フォーマット用
  * **データ保存**: ブラウザの `localStorage` のみ。キー名は `priceScout_products` とします。

### サーバーサイド (APIキー隠蔽・AI処理)

  * **バックエンド (サーバーレス)**: Vercel Functions または Netlify Functions (Node.js環境)
  * **外部API (サーバーサイドで呼び出し)**:
      * **Google Gemini API**: (Step 2) OCRテキストを文脈的に理解し、JSONに整形

## プロジェクト構成と役割 (ディレクトリ構成)

Vercel Functions を利用する場合の構成例です。クライアントサイド3ファイル + APIエンドポイント1ファイルで構成されます。

```
/
├── api/
│   └── gemini.js  # Gemini APIを呼び出すサーバーレス関数 (唯一のAPIエンドポイント)
├── index.html     # すべてのHTML構造
├── style.css      # すべてのCSSスタイル
└── app.js         # すべてのクライアントサイド・ロジック (OCR実行、APIリクエスト)
```

  * **`index.html`**: アプリのUI全体（モーダルウィンドウ含む）。
  * **`style.css`**: アプリの全スタイル。
  * **`app.js`**: `Tesseract.js` の実行、`api/gemini` への「生テキスト」送信、返却JSONの処理、`localStorage` への保存、DOM操作など、クライアント側の全ロジック。
  * **`api/gemini.js`**: クライアントから「生テキスト」を受け取り、Gemini API を呼び出し、整形したJSONをクライアントに返すサーバーレス関数。**Gemini APIキーはこのファイルでのみ安全に使用されます。**

## アーキテクチャ指針

### 1\. 設計原則: 軽量クライアント + AI後処理

  * クライアント (`app.js`) は、UI操作、OCR実行、`localStorage` 管理、APIリクエストに専念します。
  * Tesseract.js のOCR結果は不完璧であることを前提とします。
  * 複雑なテキスト解析（正規表現など）をクライアントから排除し、`api/gemini.js` のAI処理に一任します。

### 2\. データモデル

```javascript
// 商品オブジェクト (localStorageに保存される形式)
const product = {
    id: '1699459200000',        // タイムスタンプ
    name: '明治おいしい牛乳',    // Geminiが抽出した商品名
    price: 298,                 // Geminiが抽出した価格
    quantity: 1000,             // ユーザーがフォームで入力
    unit: 'ml',                 // ユーザーがフォームで入力
    store: 'イオン鶴見店',       // Geminiが抽出した店舗名
    date: '2025-11-08',         // Geminiが抽出した購入日
    unitPrice: 0.298            // 自動計算 (price / quantity)
};

// 状態管理 (app.js内)
const state = {
    products: [], // 上記 product オブジェクトの配列
    searchQuery: ''
};
```

### 3\. OCR処理の指針 (Tesseract + Gemini)

#### クライアント (app.js) の役割

1.  ユーザーが画像ファイルを選択
2.  ファイルバリデーション（サイズ、形式）を実行
3.  ローディングスピナーを表示
4.  **(Step 1) Tesseract.js 実行**:
      * `Tesseract.createWorker('jpn')` でワーカーを生成
      * `worker.setParameters` を使用し、**Tesseract.js の精度をできるだけ向上**させます（Geminiが理解しやすくなるよう、ノイズを減らすため）。
          * `tessedit_char_whitelist`: 数字、カタカナ、レシートで使いそうな漢字（円、店、計、税など）に限定
          * `tessedit_pageseg_mode`: `AUTO_OSD` など、レシートに適したモードを設定
      * `worker.recognize(file)` を実行し、「生テキスト」の文字列を取得
      * `worker.terminate()` でワーカーを終了
5.  **(Step 2) `api/gemini` へ送信**:
      * Step 1 で取得した「生テキスト」をJSONペイロード（例: `{ rawText: '...' }`）として、`fetch('/api/gemini', { method: 'POST', ... })` で送信
6.  **(Step 3) JSON 受信とフォーム反映**:
      * `api/gemini` から返却されたJSONデータ（例: `{ store: '〇〇店', date: '2025-11-08', total: 1980 }`）を受け取る
      * 受け取ったデータを、編集フォーム（モーダル）の各入力欄に自動でセットする
      * ユーザーは「内容量」や「単位」など、AIが読み取れない項目のみを追加入力・修正し、保存ボタンを押す

#### サーバーレス関数 (api/gemini.js) の役割

1.  クライアントから「生テキスト」（`req.body.rawText`）を受け取る
2.  **(Step 1) Gemini API 呼び出し**:
      * Gemini API (例: Gemini 1.5 Flash) を呼び出す
      * **プロンプトが重要**: Tesseract.js のOCR結果はノイズが多いことをGeminiに伝える
        > あなたはレシート解析の専門家です。以下は、Tesseract.js というOCRエンジンで抽出した、ノイズや誤認識（例: "0" と "O"、"1" と "l" の混同）を多く含む可能性のあるレシートのテキストです。
        > このテキストの文脈を読み取り、**店舗名**、**合計金額（税込）**、**購入日（YYYY-MM-DD形式）** を推測・補完し、厳密なJSON形式で回答してください。
        > OCRテキスト:
        > ```
        > [app.js から送られてきた rawText をここに挿入]
        > ```
3.  **(Step 2) 整形して返却**:
      * Gemini が生成したJSON（例: `{"store": "イオン鶴見店", "total": 298, "date": "2025-11-08"}`）を、クライアント (`app.js`) にレスポンスとして返す

## アンチパターン (禁止事項)

  * ❌ **APIキーのクライアントサイド保持**: `app.js` や `index.html` に Gemini のAPIキーを記述することは**絶対に禁止**します。
  * ❌ **クライアントサイドでの複雑な解析**: `app.js` で正規表現（RegEx）を駆使してテキストを解析しようとすることは**禁止**します。テキスト解析はすべて `api/gemini` に一任します。
  * ❌ **複雑なバックエンド/DB**: データベース（SQL/NoSQL）や、`/api/gemini` 以外の専用バックエンドサーバーの構築は禁止します。（APIキーを隠蔽するサーバーレス関数のみ許可）
  * ❌ **フレームワーク**: React, Vue, Svelte, Angular など（Vanilla JS のみ）
  * ❌ **UIライブラリ**: Bootstrap, Materialize CSS, Chakra UI など