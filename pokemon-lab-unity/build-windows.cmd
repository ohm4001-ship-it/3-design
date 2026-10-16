@echo off
setlocal
chcp 65001 >nul
if not exist "%~dp0Logs" mkdir "%~dp0Logs"
set "POKELAB_CLI=%LOCALAPPDATA%\Unity\bin\unity.exe"
if not exist "%POKELAB_CLI%" set "POKELAB_CLI=%USERPROFILE%\AppData\Local\Unity\bin\unity.exe"
if exist "%POKELAB_CLI%" (
  "%POKELAB_CLI%" run "%~dp0." --editor-version 6000.3.26f1 -- -buildTarget Win64 -executeMethod PokeLab.Editor.ProjectBuilder.BuildWindows -logFile "%~dp0Logs\build-windows.log"
  if errorlevel 1 goto failed
  goto verify
)
set "POKELAB_EDITOR=%LOCALAPPDATA%\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%USERPROFILE%\AppData\Local\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%ProgramFiles%\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" (
  echo Unity 6000.3.26f1을 찾지 못했어요. Unity Hub에서 해당 버전을 설치해주세요.
  goto failed
)
"%POKELAB_EDITOR%" -batchmode -quit -projectPath "%~dp0." -buildTarget Win64 -executeMethod PokeLab.Editor.ProjectBuilder.BuildWindows -logFile "%~dp0Logs\build-windows.log"
if errorlevel 1 goto failed
:verify
if not exist "%~dp0Builds\Windows\PokeLabWilds.exe" goto failed
echo Windows 게임 빌드가 완료됐어요. start-game.cmd로 실행하세요.
if /i not "%~1"=="--no-pause" pause
exit /b 0
:failed
echo 빌드하지 못했어요. Logs\build-windows.log와 Unity 계정 인증 상태를 확인해주세요.
echo 이 프로젝트가 Unity Editor에서 열려 있다면 닫고 다시 실행하세요.
if /i not "%~1"=="--no-pause" pause
exit /b 1
