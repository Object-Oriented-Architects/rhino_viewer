# RhinoViewer — Rhino 8 렌더러 플러그인

Rhino 8(Windows) 도킹 패널에 웹 뷰어(`/viewer-live`)를 WebView2로 띄워 현재 문서를 실시간으로 보여 준다.
보이는 객체를 독립 실행 HTML·EXE로 내보내 Rhino 없이도 볼 수 있다.

## 빌드

repo 루트에서 순서대로 실행한다. 필요한 것: .NET 7 이상 SDK, Node·pnpm, WebView2 Runtime.

```powershell
pnpm install
pnpm build:shell                                         # out/ (패널용 웹 빌드) + dist/rhinoviewer-shell.html (내보내기 셸)
dotnet build viewerhost\RhinoViewerHost.csproj -c Release  # EXE 내보내기 템플릿
dotnet build plugin\RhinoViewer.csproj -c Debug             # 셸·템플릿이 있으면 rhp 옆에 복사된다
```

Rhino가 rhp를 로드한 상태면 마지막 빌드가 MSB3027(파일 잠김)로 실패한다. Rhino를 닫고 다시 빌드한다.

## 설치

처음 한 번 `plugin\bin\Debug\net7.0\RhinoViewer.rhp`를 Rhino 창에 끌어다 놓는다(또는 `PlugInManager` → Install).
이후 다시 빌드하면 Rhino를 재시작할 때 새 rhp가 로드된다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `RhinoViewer` | 뷰어 패널을 연다. 처음 열면 떠 있는 창으로 나오며, 끌어서 도킹할 수 있다 |
| `RhinoViewerExport` | 보이는 선택(없으면 보이는 전체)을 `.html` 또는 `.exe`로 내보낸다. 저장 대화상자에서 확장자를 고른다 |
| `RhinoViewerCameraSync` | Rhino 뷰포트 카메라 따라가기를 켜고 끈다 |
| `RhinoViewerSync` | 캐시를 비우고 보이는 전체를 다시 동기화한다 |
| `RhinoViewerDiagnostics` | 웹 루트·포트·WebView2·페이지 상태를 명령줄에 찍는다 |

객체 재질은 Rhino의 객체 지정·레이어 지정·블록 부모 상속 규칙으로 읽는다. 이름으로 분류하지 않는다.

- 재질 없음 → 웹 설정의 플래티넘
- Gem 프리셋 6종(diamond·ruby·sapphire·emerald·amethyst·aquamarine) → 보석 렌더러, 색·굴절률 반영
- 그 밖의 재질(Metal·플라스틱·페인트·유리·PBR 등) → 색·금속성·거칠기 등을 반영한 일반 재질, 투명은 투과
- 프롱도 입힌 재질대로 표시하며, 조명·반사 환경·톤은 웹 뷰어 설정을 유지한다.
- 재질 편집·지정 변경은 패널에 반영되고 HTML·EXE 내보내기도 같은 재질 표를 쓴다.
- 면별(sub-object) 재질·텍스처·범프는 지원하지 않는다.

## 동작 메모

- 패널은 화면에 처음 보일 때 WebView2·로컬 서버(127.0.0.1, 임의 포트)를 시작한다.
  창 없는(headless)·창을 숨긴 RhinoCore 호스트에서는 시작하지 않는다.
- 문서를 저장하지 않아도 된다. 변경된 객체만 메시로 만들어 메모리에서 서빙하고, 메싱·압축은 백그라운드에서 한다.
- 웹 루트 탐색 순서: 환경변수 `RHINOVIEWER_WEBROOT` → rhp 옆 `wwwroot\` → repo의 `out\`.
- 내보낸 EXE는 Windows x64 + WebView2 Runtime에서 단독 실행된다(`viewerhost\README.md`).
