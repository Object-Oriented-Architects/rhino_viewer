# RhinoViewerHost

Windows x64 WinForms host targeting .NET Framework 4.8. Requires the installed WebView2 Runtime, not a separate .NET (Core/5+) installation. The project does not use Rhino.

```powershell
dotnet build viewerhost\RhinoViewerHost.csproj -c Release
pwsh -File viewerhost\tools\make-exe.ps1 `
  -Template viewerhost\bin\Release\net48\RhinoViewerHost.exe `
  -Html path\scene.html -Out path\Scene.exe
```

Distribute only the resulting EXE. `Microsoft.Web.WebView2` 1.0.4258.31 Core/WinForms assemblies and the x64 loader are embedded. The PDB and EXE.config generated alongside the template are not needed for execution (tested from an otherwise empty folder). Do not rename a DLL to EXE or use a previously packed EXE as the template. The packing tool validates UTF-8 incrementally, refuses in-place output/already-packed templates, and publishes a same-directory temporary file only after completing the footer.

For Rhino plugin distribution, this Release template is ZIP-compressed with the web assets and HTML shell inside `RhinoViewer.rhp`.
The plugin exports EXEs from the embedded template stream; no `RhinoViewerHost.exe` is needed beside the rhp.
The `make-exe.ps1` tool above independently packs an existing HTML file. See `plugin/README.md` for the plugin build order.

## C4 payload and caches

The final 16 bytes are a little-endian Int64 HTML **byte** length followed by ASCII `RVHTML01`. The payload is read from `Assembly.GetEntryAssembly().Location`, hashed/copied with bounded 128 KiB buffers, and published as:

- `%LOCALAPPDATA%\RhinoViewerHost\scenes\<SHA-256 first 16 lowercase hex characters>\index.html`
- `%LOCALAPPDATA%\RhinoViewerHost\bin\1.0.4258.31\x64\WebView2Loader.dll`
- `%LOCALAPPDATA%\RhinoViewerHost\WebView2\` (browser profile)

Scene extraction is serialized by a named mutex. Existing scene bytes are hash-checked; valid cache files are not rewritten. Temporary files avoid serving incomplete extraction. The loader cache is also SHA-256 checked and atomically published. No output is written beside the running EXE in normal mode. Cache cleanup is manual; there is no eviction policy.

`Main` installs `AssemblyResolve` before entering non-inlined WebView2 code. The loader folder is set before any other `CoreWebView2Environment` static API. The SDK XML at `lib/net462/Microsoft.Web.WebView2.Core.xml` documents `SetLoaderDllFolderPath` (lines 4411–4425) and warns against `.local` virtual hosts (line 2161). This host maps the scenes root to `https://rhinoviewer.example/` with `Allow` access, then navigates to `/<hash>/index.html`.

Devtools and the built-in context menu are disabled. HTTP(S) new-window requests open the default browser; non-HTTP(S) schemes are blocked rather than launching arbitrary OS URI handlers. Scene caches share the virtual origin as required by the contract; this is not an isolation boundary between untrusted exported scenes.

## Probe

```powershell
$p = Start-Process .\Scene.exe -ArgumentList '--probe "C:\temp\probe.json" --wait 60000' -PassThru
$p.WaitForExit()
$p.ExitCode
```

The screenshot path is the literal output path plus `.png`: `probe.json.png`. The JSON contains the final page snapshot (`canvas`, `spinner`, `errors`, `state`), `elapsedMs`, `sceneFolder`, `sceneReused`, `captureCondition`, `captured`, `windowMode`, `runtimeVersion`, and the screenshot path. Separate `diagnostics` and `resourceFailures` preserve error event/resource coordinates without changing the page's own error array. Parent output directories are created automatically.

- `modelBox+2s`: spinner absent and `state.modelBox != null`, then at least two seconds of stable readiness.
- `legacy-canvas+5s`: no `modelBox` property, spinner absent and at least one canvas, then at least five seconds of stable readiness.
- A present but null `modelBox` never takes the legacy fallback.
- Exit 0 = captured; 2 = timeout; 3 = no/invalid payload; 1 = another startup/browser/output error.
- Probe mode never opens error message boxes. A bare template writes exactly `{"error":"no-payload"}`.
- Exit 0 does **not** certify a render or clear page errors. The caller must check errors and C5's luminance < 200 pixel ratio >= 1%.

Probe uses a normal, non-activating off-screen window, not minimization. Measurement showed minimized WebGL could capture but a static canvas's `CapturePreviewAsync` could stall until timeout; off-screen normal mode passed both. The normal interactive window is centered and 1280×800 (outer size).

## Export format and validation

Current viewer-live exports embed a gzip RVM2 object collection with a material table in an RVS1 container via `window.__SCENE_RVS`. The HTML packer inlines CSS, JavaScript and environment assets; this export path does not require rhino3dm or a CDN. The C4 host treats the HTML payload as opaque bytes. Render acceptance still requires checking page errors and the C5 pixel ratio, not just a successful probe exit.

Not tested on a physically Runtime-free PC, ARM64 hardware, or a downloaded/MOTW-marked executable. The x64 build relies on x64 emulation on supported Windows ARM64, not native ARM64. Exports are unsigned, so SmartScreen reputation warnings remain a distribution issue. Ignore build artifacts `viewerhost/bin/`, `viewerhost/obj/` and local validation `temp/` (no .gitignore edits are made here).
