@echo off
setlocal
chcp 65001 >nul
set "POKELAB_CLI=%LOCALAPPDATA%\Unity\bin\unity.exe"
if not exist "%POKELAB_CLI%" set "POKELAB_CLI=%USERPROFILE%\AppData\Local\Unity\bin\unity.exe"
if exist "%POKELAB_CLI%" (
  "%POKELAB_CLI%" open "%~dp0." --editor-version 6000.3.26f1 --args "-executeMethod PokeLab.Editor.ProjectBuilder.Play"
  if errorlevel 1 goto failed
  exit /b 0
)
set "POKELAB_EDITOR=%LOCALAPPDATA%\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%USERPROFILE%\AppData\Local\Unity\Editors\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" set "POKELAB_EDITOR=%ProgramFiles%\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe"
if not exist "%POKELAB_EDITOR%" (
  echo Unity 6000.3.26f1을 찾지 못했어요. Unity Hub에서 해당 버전을 설치해주세요.
  goto failed
)
start "PokeLab Unity" "%POKELAB_EDITOR%" -projectPath "%~dp0." -executeMethod PokeLab.Editor.ProjectBuilder.Play
if errorlevel 1 goto failed
exit /b 0
:failed
echo Unity를 열지 못했어요. 계정 인증과 설치 버전을 확인한 후 다시 실행해주세요.
pause
exit /b 1
