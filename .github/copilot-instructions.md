このドキュメントについて
GitHub Copilot が本リポジトリのコンテキストを理解しやすくするためのガイドです。

このプロジェクトは、単一の index.html ファイルに全てのロジックを実装することを最優先とします。

サーバーレス関数（api/ ディレクトリ）やビルドツール、複雑な構成は一切使用しません。

前提条件
回答は必ず日本語でしてください。

このプロジェクトは 単一の index.html ファイル で完結させます。style.css や app.js などの外部ファイルは作成しないでください。

CSSは <style> タグ内に記述します。

JavaScriptは <script> タグ内に記述します。

アプリ概要
PriceScout (プライススカウト) は、レシート撮影で商品価格を記録し、過去の最安値を検索できるシンプルな価格管理アプリです。

主な機能
APIキー入力: ユーザーが自身の Google Gemini API キーを入力し、sessionStorage に保存します。（セキュリティのため、コードにキーをハードコードしません）

レシート撮影・AI OCR登録:

ブラウザから Gemini API (gemini-1.5-flash など) に直接、レシート画像（Base64）を送信します。

Gemini が画像を解析し、店舗名、購入日、商品リスト（商品名と価格のペア） を含む厳格なJSON形式で返却します。

商品価格検索: 登録した商品名を部分一致で検索し、結果を単位価格の安い順に表示します。

単位量換算: 「1gあたり」「1mlあたり」などの単位量あたりの価格を自動計算します。

データ管理: 全てのデータはブラウザの localStorage に保存されます。

技術スタック概要
ファイル構成: index.html のみ。

言語: HTML5, CSS3, Vanilla JavaScript (ES6+)

主要ライブラリ (CDN):

Day.js: 日付フォーマット用（必須ではないが、あると便利）

外部API:

Google Gemini API (gemini-1.5-flash): ブラウザの fetch API から直接呼び出します。

データ保存: localStorage (商品データ用), sessionStorage (APIキー用)

プロジェクト構成と役割 (単一ファイル内)
index.html (単一ファイル)
<head>: <style> タグ、Day.jsのCDNリンクを配置。

<body>:

APIキー入力欄 (<input type="password" id="apiKeyInput">) と保存ボタン。

メインのアプリUI（レシート撮影ボタン、検索欄、商品リスト表示エリア）。

編集用モーダルウィンドウ。

<script>:

すべてのJavaScriptロジックをここに記述します。

アーキテクチャ指針
1. 設計原則: 完全なクライアントサイド完結
Tesseract.js、サーバーレス関数は一切使用しません。

状態管理は、localStorage とグローバルな state 変数（{ products: [], searchQuery: '' }）のみで行います。

2. APIキーの管理 (最重要)
ハードコード厳禁: JavaScriptコード内にAPIキーを絶対に記述しないでください。

UIでの入力: 起動時にAPIキーが sessionStorage にない場合、APIキー入力欄を表示します。

保存: ユーザーが入力したキーは sessionStorage.setItem('gemini_api_key', key) で保存します。これにより、タブを閉じるとキーは破棄され、安全性が高まります。

取得: fetch を呼び出す際は sessionStorage.getItem('gemini_api_key') でキーを取得して使用します。

3. OCR処理の指針 (Gemini Vision)
JavaScript ( <script> タグ内) の役割
画像選択: ユーザーが <input type="file"> で画像を選択します。

画像→Base64変換: FileReader を使用し、選択された画像を Base64 文字列に変換します。

APIキー取得: sessionStorage からAPIキーを取得します。キーがなければ処理を中断し、入力を促します。

Gemini API リクエスト (fetch):

エンドポイント: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=...

method: 'POST'

body: 以下の構造を持つペイロードを JSON.stringify します。

contents: ユーザープロンプトと画像データを含めます。

JSON

{
  "contents": [
    {
      "parts": [
        { "text": "このレシート画像を解析し、以下のJSONスキーマに従って店舗名、購入日、および購入したすべての商品リスト（商品名と価格）を抽出してください。" },
        {
          "inlineData": {
            "mimeType": "image/jpeg", // または "image/png"
            "data": "[ここにBase64エンコードされた画像文字列]"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "OBJECT",
      "properties": {
        "store": { "type": "STRING", "description": "店舗名" },
        "date": { "type": "STRING", "description": "購入日 (YYYY-MM-DD形式)" },
        "items": {
          "type": "ARRAY",
          "description": "購入した商品のリスト",
          "items": {
            "type": "OBJECT",
            "properties": {
              "name": { "type": "STRING", "description": "商品名" },
              "price": { "type": "NUMBER", "description": "価格（税込）" }
            }
          }
        }
      }
    }
  }
}
レスポンス処理:

返却されたJSON (response.json()) の candidates[0].content.parts[0].text をパースします。

このJSONデータ（店舗名、日付、商品リスト）を編集フォームに自動入力します。

注意: Geminiが商品リスト（items）を返すため、ユーザーは主に「内容量」「単位」の追加入力・修正を行います。

アンチパターン (禁止事項)
❌ APIキーのハードコード: JavaScriptコード内にAPIキーを文字列として記述すること。

❌ 外部JS/CSSファイル: index.html 以外のアセット（app.js, style.css）を作成すること。

❌ サーバーレス関数: api/ ディレクトリの作成や、バックエンドサーバーを前提としたコード。

❌ Tesseract.js: CDNからの読み込みや使用。

❌ Cloud Vision API: Google Cloud Vision API の使用。

❌ 複雑なビルドツール: npm, webpack, Vite などの使用。