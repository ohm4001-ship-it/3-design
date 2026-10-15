# 다른 사람에게 사이트 공유하기

기본 화면은 이제 Hunyuan3D-2mv 직접 생성 화면입니다. 사진 입력과 공식 Space 추론을 바로 연결하며 기존 보정 도구는 `/studio`에서 열 수 있습니다. 자세한 차이는 [HUNYUAN_DIRECT.md](HUNYUAN_DIRECT.md)를 확인하세요.

Windows에서 프로젝트 폴더를 열고 실행합니다.

```powershell
npm run share
```

앱을 빌드하고 공유용 Node 서버와 Cloudflare Quick Tunnel을 숨김 창으로 실행합니다. 출력되는 `https://….trycloudflare.com` 주소를 다른 사람에게 보내면 됩니다. 최초 실행에는 인터넷 연결이 필요합니다. Node.js 22 이상과 설치된 프로젝트·cad 의존성이 필요합니다.

```powershell
npm run share:status
npm run share:stop
```

현재 PC에서만 서버를 실행하므로 PC를 끄거나 절전 상태로 전환하면 접속할 수 없습니다. 터널을 새로 실행하면 주소도 바뀝니다. [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)은 계정 없이 테스트용 임시 주소를 제공하며 가동 시간을 보장하지 않습니다.

## 작업 데이터

- 기존 `out`, Stanley 사진, 로컬 미리보기 결과를 공개하지 않습니다.
- 새 방문자는 빈 작업 공간에서 시작합니다. 브라우저의 HttpOnly 세션 쿠키에 따라 업로드·보정·모델·다운로드를 분리합니다. 같은 브라우저의 탭들은 같은 공간을 씁니다.
- 세션은 서버를 실행하는 동안 유지됩니다. 서버 재시작 또는 쿠키 삭제 후에는 새 공간을 사용합니다. 이전 파일을 복구하는 계정·목록 화면은 없습니다.
- 데이터와 실행 로그는 Git에서 제외되는 `.gstack/tmp/share` 안에 저장합니다. 공유 중지 시 파일을 자동 삭제하지 않습니다.
- 공유 서버는 PC 소유자의 Hugging Face 로그인 토큰을 사용하지 않습니다. AI 생성은 외부 무료 공급자의 지원 여부·가동 상태·할당량에 따라 실패할 수 있습니다. 사진 전송은 사용자가 화면에서 AI 생성 작업을 실행할 때 발생합니다. 초기 GLB/OBJ 가져오기와 제품 실루엣 생성은 별도 경로입니다.
- 이 구성은 소규모 시연용입니다. 계정 로그인·장기 저장·자원 할당·관리자 화면을 갖춘 상시 운영 서비스는 아닙니다.

실행 파일은 Cloudflare 공식 `2026.10.0` Windows x64 배포본이며 다운로드 후 SHA256을 검증합니다. 중지할 때는 저장된 PID와 실제 실행 경로를 확인하여 이 프로젝트가 띄운 프로세스만 종료합니다.

## PC를 꺼도 유지하려면

Node 웹 서비스를 지원하는 호스팅 계정과 서버 자원이 필요합니다. GitHub Pages는 HTML·CSS·JavaScript 파일만 제공하므로 이 앱의 Node/Sharp 서버를 실행할 수 없습니다. 저장소를 연결한 Node 호스팅에서는 다음 설정을 사용합니다.

```text
Build: npm ci && npm --prefix cad ci && npm run build:app
Start: npm start
HOST=0.0.0.0
SIXVIEW_ISOLATED=1
SIXVIEW_DATA_DIR=/data/sixview
Health check: /healthz
```

포트는 호스팅이 제공하는 `PORT` 환경 변수를 읽습니다. 데이터 디렉터리는 실행 계정이 쓸 수 있는 경로로 지정해야 하며, 파일 보존이 필요하면 호스팅의 영구 저장소를 연결합니다. 위 설정은 배포 준비용이며 실제 클라우드 계정에 배포한 상태를 의미하지 않습니다.

## 검증

2026-10-15: 전체 자동 테스트 26개 통과. 외부 HTTPS 주소에서 화면과 정적 파일 200 응답, 자체 생성 참조 이미지 5장 업로드, 실루엣 3D 생성(6,840개 삼각형), GLB 다운로드를 확인했습니다. 다른 방문자 공간에서 해당 사진과 모델에 접근하면 404를 반환했습니다. 실제 사진의 AI 생성이나 형상 정확도를 검증한 결과는 아닙니다. 상세 HTTP 결과는 `docs/evidence/sharing-public.json`에 저장합니다.
