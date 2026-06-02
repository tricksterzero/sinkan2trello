@echo off
rem 新刊.net to Trello を実行する Windows 用ランチャ。
rem このバッチ（またはそのショートカット）をスタートアップやデスクトップに置くと、
rem Windows 起動ごとに 1 回、新刊情報を Trello に登録できる。

rem 日本語ログが文字化けしないようコンソールを UTF-8 にする。
chcp 65001 >nul

rem このバッチが置かれたフォルダへ移動する（clone 先がどこでも動く）。
cd /d "%~dp0"

node index.js --verbose

rem 実行ログを確認できるようウィンドウを残す（キー入力で閉じる）。
pause
