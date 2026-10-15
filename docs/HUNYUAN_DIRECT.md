# Hunyuan3D-2mv 직접 생성 화면

기본 주소 `/`는 사진 → AI 생성 → 원본 3D 미리보기 → GLB 다운로드 흐름입니다. 이전 정렬·보호·치수 스튜디오는 `/studio`에 보존합니다.

이 화면은 공식 데모의 생성 흐름을 구현한 독립 클라이언트입니다. 공식 화면을 iframe으로 넣은 것이 아닙니다. 이 PC에는 공식 Hunyuan3D-2mv Turbo 및 Turbo VAE 모델 가중치와 Python/CUDA 환경을 설치했습니다. 로컬 GPU 서버가 준비되면 우선 사용하며, 준비되지 않았을 때는 `https://tencent-hunyuan3d-2mv.hf.space`의 `shape_generation` API를 호출합니다. 공식 Space 경로를 사용하면 사진이 해당 외부 서비스로 전송됩니다.

## 입력과 결과

- Front 한 장이 필요하며 Back·Left·Right는 선택입니다. 윗면·초기 모델·축 정렬은 요구하지 않습니다. 공개 Python 코드가 마지막에 `image['front']`를 읽으므로 비정면 한 장만 보내는 요청은 차단합니다.
- 네 슬롯은 공식 API의 Front·Back·Left·Right 순서 그대로 전송합니다. 이전 스튜디오의 물체 좌표계에 맞춘 좌우 교환은 적용하지 않습니다.
- Turbo/Fast/Standard는 공식 UI처럼 추론 단계 5/10/30을 설정합니다. 디코딩 Low/Standard/High는 196/256/384입니다. 고급 설정으로 seed·단계·해상도·guidance·chunks·배경 제거·seed 무작위를 전달합니다.
- 서버는 반환된 GLB 바이트를 변경하지 않습니다. 형상 깎기·축 맞춤·색 투영·다른 생성 방식으로의 대체가 없습니다. 뷰어의 표시 위치와 크기 조절은 다운로드 파일에 적용되지 않습니다.
- 실패는 실패로 표시합니다. GPU 할당량·서비스 정지·대기열 문제는 공식 Space에서 발생할 수 있습니다. 실제 외부 호출에서는 ZeroGPU 할당량 오류를 확인했습니다. 이 클라이언트는 소유자의 Hugging Face 로그인 토큰을 사용하지 않습니다.
- 해당 공식 Space의 형상 생성 경로를 사용합니다. 텍스처 생성, 메시 단순화와 다중 형식 변환까지 복제한 것은 아닙니다. 다운로드는 원본 GLB입니다.
- 샘플 버튼은 이 프로젝트에서 만든 합성 컵 렌더 4장을 넣습니다. AI 생성 결과나 실제 촬영 사진으로 표시하지 않습니다.

## 실행 구조

`src/web/hunyuan.ts`가 입력을 검사하고 비동기 작업을 시작합니다. `/api/hunyuan/job`으로 상태를 확인하고, 성공한 작업만 `/api/hunyuan/result?id=...`에서 받습니다. 브라우저별 작업 공간과 결과 접근 권한을 분리합니다. 공유 서버는 전체 한 작업씩 처리하며 각 작업에 5분 제한을 둡니다. 동시 요청에는 429를 반환합니다.

로컬 서버는 `tools/hunyuan-local/server.py`로 `127.0.0.1:8090`에만 연결합니다. 원본 모델과 배경 제거기를 사용하며, 저메모리 모드에서 공식 standalone pipeline의 `components` 누락과 실행 장치 설정을 보완했습니다. 외부에서 GPU 서버에 직접 접근할 수 있게 포트를 열지는 않습니다.

```powershell
# 최초 한 번: 전용 Python/CUDA 환경과 공식 가중치 준비
npm run ai:setup
# RTX 4070 Laptop 8GB 등에서 저메모리 실행
npm run ai:local -- --low-vram
# 다른 터미널에서 사이트 공유
npm run share
```

가중치와 캐시는 Git에서 제외되는 `local-ai` 안에 저장합니다. 최초 준비에는 모델 다운로드와 배경 제거 라이브러리 초기화 시간이 필요합니다. GPU 서버가 꺼져 있으면 공식 Space 경로를 사용할 수 있으므로 외부 전송을 원하지 않는 경우 로컬 서버의 `/health` 준비 상태부터 확인하세요.

이미지는 PNG·JPEG·WebP, 장당 12MB, 디코딩 1,600만 픽셀, 전체 요청 64MB로 제한합니다. 서버 재시작 시 진행 상태 목록은 초기화됩니다. 로컬 결과 파일이 남아도 새로운 세션에서 자동 노출하지 않습니다.

화면은 `cad/src/hunyuan`에 있으며 직접 구현했습니다. 공개 소스와 실행 중 API 설정을 참고했습니다.

- [공식 데모](https://tencent-hunyuan3d-2mv.hf.space/)
- [Space 공개 소스](https://huggingface.co/spaces/tencent/Hunyuan3D-2mv/blob/main/gradio_app.py)
- [Tencent Hunyuan3D-2 저장소](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)

## 검증

자동 테스트 28개와 TypeScript·웹 빌드가 통과했습니다. 직접 생성 계약 테스트에서는 공급자 결과 바이트 보존, 입력 검증, 세션 간 다운로드 차단, 처리 중 요청 제한, 실패 시 대체 결과를 만들지 않는 것을 확인했습니다. 로컬 연결 테스트에서는 공식 좌우 순서를 바꾸지 않고 seed·단계·guidance·배경 제거 설정을 전달하는 것을 확인합니다.

2026-10-15 실제 실행: RTX 4070 Laptop 8GB의 로컬 Hunyuan3D-2mv Turbo에서 합성 컵 4장을 생성했습니다. 단계 5, 해상도 256, seed 1234, guidance 5, chunks 8000, 배경 제거 끄기를 사용했습니다. GPU 서버 로그 기준 23.2초, 349,800개 삼각형이며 브라우저 미리보기와 원본 GLB 다운로드를 확인했습니다. GLB는 6,297,200바이트이고 별도 형상·색 보정을 하지 않았습니다. 한 합성 예제 결과이므로 실제 촬영 정확도나 일반적인 생성 시간으로 확대 해석하지 않습니다. 배경 제거는 이번 추론에서 끈 상태였으며 모든 기능의 실측 검증을 의미하지 않습니다.

실제 결과는 `docs/evidence/hunyuan-live.json`, 자동 테스트 결과는 `docs/evidence/hunyuan-tests.txt`, 다운로드한 모델은 Git에서 제외되는 `out-hunyuan-direct/model.glb`에 있습니다. 공유 주소는 임시 주소이며 실행 중 바뀔 수 있으므로 현재 값은 `.gstack/tmp/share/runtime.json`에서 확인합니다.
