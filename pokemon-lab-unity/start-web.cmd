@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0Builds\WebGL\index.html" (
  echo 아직 웹 게임 빌드가 없어요. 먼저 build-web.cmd를 실행해주세요.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo 로컬 웹 서버를 실행하려면 Node.js가 필요해요.
  pause
  exit /b 1
)
echo 브라우저에서 http://127.0.0.1:5181/ 을 열어주세요. 이 창을 닫으면 서버가 종료됩니다.
node tools\serve-web.mjs
if errorlevel 1 (
  echo 서버를 실행하지 못했어요. 위 오류와 포트 5181 사용 여부를 확인해주세요.
  pause
  exit /b 1
)
pause
exit /b 0
