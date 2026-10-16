@echo off
setlocal
chcp 65001 >nul
if not exist "%~dp0Logs" mkdir "%~dp0Logs"
set "POKELAB_CLI=%LOCALAPPDATA%\Unity\bin\unity.exe"
if not exist "%POKELAB_CLI%" set "POKELAB_CLI=%USERPROFILE%\AppData\Local\Unity\bin\unity.exe"
if exist "%POKELAB_CLI%" (
  "%POKELAB_CLI%" run "%~dp0." --editor-version 6000.3.26f1 -- -buildTarget WebGL -executeMethod PokeLab.Editor.ProjectBuilder.BuildWebGL -logFile "%~dp0Logs\build-web.log"
  if errorlevel 1 goto failed
  goto verify
)
set "POKELAB_EDITOR=%LOCALAPPDATA%\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%USERPROFILE%\AppData\Local\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%ProgramFiles%\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" (
  echo Unity 6000.3.26f1과 Web Build Support 모듈이 필요해요. Unity Hub에서 설치해주세요.
  goto failed
)
"%POKELAB_EDITOR%" -batchmode -quit -projectPath "%~dp0." -buildTarget WebGL -executeMethod PokeLab.Editor.ProjectBuilder.BuildWebGL -logFile "%~dp0Logs\build-web.log"
if errorlevel 1 goto failed
:verify
if not exist "%~dp0Builds\WebGL\index.html" goto failed
echo 웹 게임 빌드가 완료됐어요. start-web.cmd로 로컬 서버를 실행하세요.
if /i not "%~1"=="--no-pause" pause
exit /b 0
:failed
echo 빌드하지 못했어요. Logs\build-web.log와 Unity 계정 인증 상태를 확인해주세요.
echo Web Build Support 설치 여부를 확인하고, 열려 있는 이 프로젝트의 Unity Editor를 닫아주세요.
if /i not "%~1"=="--no-pause" pause
exit /b 1
