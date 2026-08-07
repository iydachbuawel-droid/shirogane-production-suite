@echo off
setlocal
cd /d "%~dp0"
title SHIROGANE - Deploy Cloudflare Worker

echo ================================================
echo   SHIROGANE v3.0.10 - CLOUDFLARE DEPLOY
echo ================================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js tidak ditemukan.
  echo Node.js sudah diperlukan untuk build PC; bila belum ada, install Node.js LTS.
  pause
  exit /b 1
)

echo Akan deploy ke Worker: shirogane-production-suite
echo Jika browser Cloudflare terbuka, login/Allow satu kali.
echo.
call npx wrangler@latest deploy
if errorlevel 1 (
  echo.
  echo DEPLOY GAGAL. Foto pesan di atas dan kirim ke ChatGPT.
  pause
  exit /b 1
)

echo.
echo ================================================
echo DEPLOY SELESAI.
echo Cek:
echo https://shirogane-production-suite.rumah-sablon11.workers.dev/.well-known/assetlinks.json
echo ================================================
pause
