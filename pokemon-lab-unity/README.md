# POKÉ LAB · 바람결 섬

직접 꾸민 친구와 섬을 탐험하고, 야생 친구를 수집하고, 세 성소에 도전하는 **네이티브 Unity 3D 프로토타입**입니다. 기존 웹 화면을 감싼 앱이 아니라 Unity 메시·조명·카메라·UI로 구현했습니다.

기준 버전은 **Unity 6.3 LTS / 6000.3.26f1**입니다. Windows 64비트와 WebGL 빌드를 완료하고 실제 플레이를 검증했습니다. 자세한 범위와 증거는 `docs/verification.md`에 있습니다.

## 게임만 플레이하기 — 개발 지식이 없어도 됩니다

**Windows 게임 ZIP으로 실행하는 방법을 추천합니다.** Unity 설치, 계정 로그인, 코딩, 별도 빌드가 필요하지 않습니다. Windows 64비트 PC와 키보드·마우스를 준비하세요.

### 1. 게임 실행하기

1. 전달받은 **`pokemon-lab-unity-windows.zip`** 파일을 찾습니다. 이 PC에서는 프로젝트 폴더와 같은 위치인 `C:\Users\SSAFY\Desktop\2dto3d`에 있습니다.
2. ZIP 파일을 마우스 오른쪽 버튼으로 클릭하고 **모두 압축 풀기**를 선택합니다.
3. 압축을 푼 폴더 안의 **`Windows`** 폴더를 엽니다.
4. **`PokeLabWilds.exe`**를 더블클릭하면 게임이 시작됩니다. 파일 확장자가 숨겨져 있으면 `PokeLabWilds`로 보일 수 있습니다.

ZIP 안에서 바로 실행하지 말고 먼저 압축을 풀어주세요. 게임을 다른 PC로 옮길 때는 **Windows 폴더 전체**를 복사하세요. 실행 파일 옆의 `PokeLabWilds_Data`, DLL 등도 필요합니다.

이미 이 프로젝트 폴더에 완성된 게임이 있는 현재 PC에서는 **`start-game.cmd`를 더블클릭**해도 됩니다. `pokemon-lab-unity-project.zip`은 개발용 소스이며 게임 실행 파일을 포함하지 않습니다. 게임만 즐기려면 이름에 **windows**가 들어간 ZIP을 사용하세요.

### 2. 처음 5분 동안 해보기

1. 게임에서 **친구 만들기**를 열고 마음에 드는 모습·색·이름을 고릅니다.
2. **저장하고 함께 떠나기**를 눌러 섬으로 나옵니다.
3. **WASD 또는 방향키**로 이동합니다. 마우스 오른쪽 버튼을 누른 채 움직이면 주변을 둘러볼 수 있습니다.
4. 야생 친구에게 다가가 **E**를 누릅니다. 초록 구간에 맞춰 **Space**를 누르거나, 쉬운 **편하게 수집하기** 버튼을 선택합니다.
5. **C**로 도감을 열어 수집한 친구를 확인합니다. **J**로 성소를 선택해 던전에 도전할 수 있습니다.

던전에서는 화면의 공격·기술·방어·회복 버튼을 클릭하면 됩니다. 방을 통과하면 축복을 선택하고 다음 방으로 이동하세요. 창을 닫을 때는 **Esc**, 게임 자체를 종료할 때는 **Alt + F4**를 누릅니다.

### 3. 저장하고 이어 하기

만든 친구와 수집·탐험 진행은 자동 저장됩니다. 다음에 같은 PC에서 같은 Windows 사용자로 게임을 실행하면 이어 할 수 있습니다. **진행 중인 던전의 방·체력·축복은 저장되지 않으므로**, 던전을 완료한 뒤 종료하는 것을 권장합니다. 다른 PC로 게임 폴더만 복사하면 저장 기록까지 옮겨지지는 않습니다.

### 브라우저로 플레이하고 싶다면

현재 게임 서버가 켜져 있는 **이 PC**에서는 [브라우저로 게임 열기](http://127.0.0.1:5181/)를 누르세요. 게임 화면을 한 번 클릭한 뒤 키보드로 조작하면 됩니다.

이 주소는 인터넷에 공개된 주소가 아니라 이 PC 전용 주소입니다. 다른 PC에 보내도 접속할 수 없고, 서버가 꺼지면 열리지 않습니다. 이 경우 설치 작업 없이 즐기려면 위의 Windows ZIP을 사용하세요. 브라우저판 저장은 같은 브라우저·같은 사이트에서 이어지며, 사이트 데이터를 지우면 기록이 사라질 수 있습니다. Windows판과 브라우저판의 진행 기록은 서로 자동 공유되지 않습니다. 휴대폰 터치 조작은 지원하지 않습니다.

### 실행이 안 될 때

| 증상 | 해결 방법 |
| --- | --- |
| 실행 파일이 없어요 | 소스 ZIP이 아닌 `pokemon-lab-unity-windows.zip`을 받았는지 확인하세요. |
| 데이터나 DLL이 없다는 메시지가 나와요 | ZIP을 새 폴더에 모두 압축 풀고, 그 안의 `Windows/PokeLabWilds.exe`를 실행하세요. EXE만 따로 옮기면 실행되지 않습니다. |
| 웹 주소가 열리지 않아요 | 이 PC의 게임 서버가 켜져 있어야 합니다. 간단히 플레이하려면 Windows판을 실행하세요. |
| 브라우저에서 키가 먹지 않아요 | 게임 화면의 빈 곳을 한 번 클릭한 뒤 이동 키를 눌러보세요. 이름 입력 중이면 입력을 마치고 창을 닫으세요. |
| 그래도 실행되지 않아요 | 오류 문구 또는 화면 캡처와 함께 어떤 ZIP을 실행했는지 제작자에게 알려주세요. 직접 Unity를 설치하거나 빌드할 필요는 없습니다. |

## 개발자용: Unity에서 편집하기

아래부터는 게임 내용을 수정하거나 직접 빌드하려는 사람을 위한 안내입니다. **게임만 플레이할 때는 읽지 않아도 됩니다.**

**Unity에서 편집·플레이:**

1. `launch-unity.cmd`를 실행합니다. Unity 6000.3.26f1로 프로젝트를 열고 Play 모드 진입을 요청합니다.
2. 직접 열려면 Unity Hub에 이 폴더를 추가합니다. 첫 임포트 뒤 장면이 없다면 **PokeLab → Prepare project**를 실행합니다.
3. `Assets/Scenes/Adventure.unity`를 열고 **Play**를 누릅니다.
4. **친구 만들기**에서 모양·색·이름을 바꾸고 **저장하고 함께 떠나기**를 선택합니다.

Unity Editor 실행에는 해당 계정의 활성화된 라이선스가 필요합니다. 설치와 라이선스 활성화는 별도 단계입니다. 관련 안내는 [Unity 공식 활성화 도움말](https://support.unity.com/hc/en-us/articles/211438683-How-do-I-activate-my-license)에서 확인할 수 있습니다.

## 플레이와 조작

| 상황 | 조작 |
| --- | --- |
| 섬 이동 / 달리기 | WASD 또는 방향키 / 왼쪽 Shift |
| 카메라 회전 / 확대·축소 | 마우스 우클릭 드래그 / 휠 |
| 야생 친구 만나기·캠프 보충·유적 입장 | 가까이서 E |
| 포획 | 초록 구간에 맞춰 Space 또는 볼 던지기 버튼 |
| 편한 포획 | 포획 창의 **편하게 수집하기** |
| 도감 / 성소 선택 / 섬 지도 | C / J / M |
| 던전 전투 | 1 기본 공격 · 2 속성 기술 · 3 방어 · 4 회복 |
| 창 닫기·귀환 안내 | Escape. 필수 축복 선택은 완료해야 진행됩니다. |

공방은 6개 시작 프리셋, 8개 팔레트, 체형·귀·꼬리·표정·장식·속성·크기 편집을 제공합니다. 저장한 친구도 섬에 등장하며, 도감에서 함께할 파트너를 선택할 수 있습니다.

섬은 햇살 초원·속삭임 숲·별빛 호수·달빛 유적으로 나뉩니다. 캠프에서는 볼과 열매를 보충하고, 지도에서 장소를 선택해 이동합니다. 성소는 **이끼빛 성소 / 잿불 공방 / 달그림자 유적**의 세 테마입니다. 각 성소에서 세 방을 통과하고 두 축복을 선택합니다. 적의 다음 공격을 보고 방어·회복을 활용하세요. 최초 클리어 시 수호자와 경험치·볼을 받고, 재도전에서는 최초 보상이 중복 지급되지 않습니다.

## 기존 웹 캐릭터 가져오기

기존 `pokemon-lab` 웹 프로젝트에서 캐릭터를 JSON으로 내보냅니다. 파일 내용을 복사한 뒤 Unity 공방의 **JSON 가져오기**에 붙여넣으세요. 캐릭터 설정을 가져오며, 웹 브라우저의 탐험 기록 전체를 이동하는 기능은 아닙니다.

호환 형식은 다음과 같습니다. `config`에는 이름·외형·색상·속성·크기 필드가 들어갑니다.

```json
{
  "format": "poke-lab",
  "version": 1,
  "config": {
    "name": "민트 모찌",
    "body": "round",
    "color": "#80c7a7",
    "type": "grass"
  }
}
```

공방의 **JSON 내보내기**는 Windows에서 JSON 파일과 클립보드 복사본을 만듭니다. 파일은 저장 폴더 아래 `Exports`에 생성됩니다. WebGL에서는 브라우저가 `friend.pokelab.json`을 다운로드합니다. 브라우저에서도 한국어 이름·JSON 붙여넣기와 외형 적용을 확인했습니다.

## 빌드와 요구사항

| 대상 | 스크립트 / Unity 메뉴 | 출력 |
| --- | --- | --- |
| Windows 64비트 | `build-windows.cmd` / **PokeLab → Build → Windows game** | `Builds/Windows/PokeLabWilds.exe` |
| WebGL | `build-web.cmd` / **PokeLab → Build → Web game** | `Builds/WebGL` |

빌드 스크립트는 설치된 Unity CLI의 인증 정보를 사용하는 `unity run`을 우선 실행합니다. CLI가 없을 때는 활성화된 Editor를 직접 실행합니다. 같은 프로젝트가 Editor에서 열려 있다면 닫고 빌드하거나, 열린 Editor의 **PokeLab → Build** 메뉴를 사용하세요. 실패 원인은 `Logs/build-windows.log` 또는 `Logs/build-web.log`에 기록됩니다. 자동 실행에서는 스크립트 뒤에 `--no-pause`를 붙이면 완료 후 키 입력을 기다리지 않습니다.

Unity 6000.3.26f1, 활성 라이선스, 키보드·마우스와 [Unity 6.3 시스템 요구사항](https://docs.unity3d.com/6000.3/Documentation/Manual/system-requirements.html)을 만족하는 환경이 필요합니다. WebGL 빌드에는 해당 Editor 버전의 **Web Build Support** 모듈을 추가해야 합니다. 모듈은 [Unity Hub](https://docs.unity.com/en-us/hub)에서 관리합니다. 소스 테스트만 실행할 때는 .NET SDK 10이 필요합니다.

WebGL 빌드 후 `start-web.cmd`를 실행하고 브라우저에서 `http://127.0.0.1:5181/`을 엽니다. 이 로컬 서버에는 Node.js가 필요하며 창을 닫으면 서버가 종료됩니다. HTML 파일을 직접 더블클릭하는 대신 HTTP 서버를 통해 실행하세요. WebGL에서 섬·공방·던전 전투·저장 후 새로고침·JSON 다운로드와 붙여넣기를 실제 확인했습니다. 현재 UI는 데스크톱 키보드·마우스를 기준으로 설계했으며 모바일 터치 조작은 포함하지 않습니다.

## 저장과 검증

진행 상황은 `Application.persistentDataPath/adventure.json`, 이전 저장은 `adventure.json.bak`에 보관합니다. Windows 기본 위치는 `%USERPROFILE%\AppData\LocalLow\PokeLab\PokeLab Wilds`입니다. WebGL은 브라우저 저장 공간과 동기화하며 같은 브라우저·사이트에서 새로고침 후 복원됩니다. 저장 대상은 만든 친구·도감·파트너·아이템·경험치·완료 성소·섬 위치입니다. **진행 중 던전의 체력·축복·방 상태는 임시 데이터**이며 귀환하거나 게임을 다시 실행하면 초기화됩니다.

외부 패키지 없는 순수 게임 규칙 테스트:

```powershell
dotnet run --project Tests/PokeLab.Core.Tests.csproj --configuration Release
```

제작·포획·3종 던전 완주·보상 중복 방지·저장 데이터 정규화 등의 12개 검사가 통과했습니다. 생성 지오메트리 검사와 Windows 플레이어의 전체 흐름 스모크 3회, 최종 화면 검토, WebGL 브라우저 검증도 별도로 수행했습니다.

Unity 메뉴의 **Validate generated geometry**, **Capture art previews**는 생성 메시와 아트 검토용입니다. 실행 인수 `-pokeSmoke`는 제작 → 포획 → 도감 → 지도 → 던전 완주 → 저장 복원 흐름과 화면 캡처를 수행합니다. `-pokeSmokeQuit`를 함께 주면 완료 후 종료합니다. 스모크 테스트는 새 테스트 상태와 `smoke-adventure.json`을 사용하므로 일반 `adventure.json`을 덮어쓰지 않습니다. Windows 플레이어에서는 `Builds/Windows/Evidence/runtime-smoke.txt`와 `POKELAB_SMOKE_OK` 로그를 남깁니다. 전달용 검증 화면은 프로젝트의 `Evidence/runtime/`와 `Evidence/web-creator.jpg`에 보관했습니다.

## 소스 안내

| 경로 | 역할 |
| --- | --- |
| `Assets/Scripts/GameDirector.cs` | 화면 전환, 이동, 포획, 저장, 전투 연결 |
| `Assets/Scripts/Core/` | 캐릭터 설정, 프리셋, 수집·전투·축복·보상 규칙 |
| `Assets/Scripts/Rendering/CreatureModel.cs` | 네이티브 메시로 만든 캐릭터와 표정·장식 |
| `Assets/Scripts/Rendering/WorldBuilder.cs` | 섬·해안·캠프·숲·호수·성소 환경 |
| `Assets/Scripts/Rendering/WorldEffects.cs` | 환경 애니메이션과 생성 리소스 수명 관리 |
| `Assets/Scripts/UI/GameUI.cs` | 한국어 UI, 모달, 버튼, 입력과 슬라이더 |
| `Assets/Editor/ProjectBuilder.cs` | 시작 장면·설정 준비, 빌드와 검증 메뉴 |
| `Tests/` | Unity와 분리해 실행하는 C# 규칙 검사 |
| `docs/design.md` | 시각 방향과 실제 게임 레퍼런스 |
| `docs/verification.md` | 실제 빌드·플레이·브라우저 검증 결과와 범위 |

## 폰트와 레퍼런스

한국어는 `Assets/Resources/Fonts/NotoSansKR.ttf`를 사용합니다. 동봉 파일은 공식 Noto Sans KR 가변 폰트에서 굵기 **400 / Regular**로 고정한 정적 인스턴스입니다. Unity에서 가변 폰트의 기본 굵기가 Thin으로 표시되는 문제를 피하도록 준비했습니다. Noto Sans KR은 SIL Open Font License 1.1이며 동봉된 `OFL.txt`를 유지해야 합니다. Unity와 패키지는 각 제공자의 라이선스를 따릅니다. 프로젝트에 포켓몬 원작의 모델·텍스처·맵·음원을 넣지 않았으며 캐릭터와 환경은 코드로 생성합니다. 포켓몬 관련 명칭은 원저작자의 명칭을 참고한 개인용 프로토타입입니다.

게임 구조는 [포켓몬 불가사의 던전 구조대 DX](https://mysterydungeon.pokemon.com/en-us/world/), [Minecraft Dungeons](https://www.minecraft.net/en-us/about-dungeons), [Hades 개발자 노트](https://www.supergiantgames.com/blog/hades-welcome-to-hell-update-patch-notes/)의 동료 수집·짧은 던전·축복 선택을 참고했습니다. 구현 범위와 적용 방식은 `docs/design.md`에 정리했습니다.
