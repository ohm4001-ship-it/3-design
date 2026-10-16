@echo off
setlocal
chcp 65001 >nul
set "POKELAB_GAME=%~dp0Builds\Windows\PokeLabWilds.exe"
if not exist "%POKELAB_GAME%" (
  echo 아직 Windows 게임 실행 파일이 없어요.
  echo 먼저 build-windows.cmd를 실행해 빌드한 뒤 start-game.cmd를 다시 열어주세요.
  echo Unity에서 바로 플레이하려면 launch-unity.cmd를 실행하세요.
  pause
  exit /b 1
)
start "POKE LAB Wilds" /D "%~dp0Builds\Windows" "%POKELAB_GAME%"
if errorlevel 1 (
  echo 게임을 실행하지 못했어요. Builds\Windows 폴더 전체가 있는지 확인해주세요.
  pause
  exit /b 1
)
exit /b 0
