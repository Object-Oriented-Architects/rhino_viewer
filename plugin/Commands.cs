using System;
using System.IO;
using Rhino;
using Rhino.Commands;
using Rhino.UI;
using RhinoCommand = Rhino.Commands.Command;

namespace RhinoViewer;

/// <summary>RhinoViewer — 뷰어 패널을 연다.</summary>
[CommandStyle(Style.ScriptRunner)]
public sealed class ViewerCommand : RhinoCommand
{
    public override string EnglishName => "RhinoViewer";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        Panels.OpenPanel(ViewerPanel.PanelId);
        return Result.Success;
    }
}

/// <summary>
/// RhinoViewerDiagnostics — 패널/WebView2 상태를 커맨드라인에 출력한다.
/// </summary>
[CommandStyle(Style.ScriptRunner)]
public sealed class DiagnosticsCommand : RhinoCommand
{
    public override string EnglishName => "RhinoViewerDiagnostics";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        if (Panels.GetPanel<ViewerPanel>(doc) is not ViewerPanel panel)
        {
            RhinoApp.WriteLine("RhinoViewerDiagnostics: 패널이 열려 있지 않습니다. RhinoViewer 를 먼저 실행하세요.");
            return Result.Failure;
        }

        panel.ReportState();
        return Result.Success;
    }
}

/// <summary>RhinoViewerSync — 캐시를 비우고 보이는 전체를 다시 동기화한다.</summary>
[CommandStyle(Style.ScriptRunner)]
public sealed class SyncCommand : RhinoCommand
{
    public override string EnglishName => "RhinoViewerSync";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        if (Panels.GetPanel<ViewerPanel>(doc) is not ViewerPanel panel)
        {
            RhinoApp.WriteLine("RhinoViewerSync: 패널이 열려 있지 않습니다. RhinoViewer 를 먼저 실행하세요.");
            return Result.Failure;
        }

        if (!panel.ResyncAll())
        {
            RhinoApp.WriteLine("RhinoViewerSync: 뷰어가 아직 시작되지 않았습니다. 패널이 화면에 보이면 시작됩니다.");
            return Result.Failure;
        }
        RhinoApp.WriteLine("RhinoViewerSync: 전체 재동기화를 요청했습니다.");
        return Result.Success;
    }
}

/// <summary>RhinoViewerCameraSync — 카메라 동기화를 켜거나 끈다.</summary>
[CommandStyle(Style.ScriptRunner)]
public sealed class CameraSyncCommand : RhinoCommand
{
    public override string EnglishName => "RhinoViewerCameraSync";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        if (Panels.GetPanel<ViewerPanel>(doc) is not ViewerPanel panel)
        {
            RhinoApp.WriteLine("RhinoViewerCameraSync: 패널이 열려 있지 않습니다. RhinoViewer 를 먼저 실행하세요.");
            return Result.Failure;
        }

        panel.CameraSyncEnabled = !panel.CameraSyncEnabled;
        RhinoApp.WriteLine("RhinoViewerCameraSync: 카메라 동기화 " + (panel.CameraSyncEnabled ? "켜짐" : "꺼짐"));
        return Result.Success;
    }
}

/// <summary>보이는 선택(없으면 보이는 전체)을 독립 실행 HTML 또는 EXE로 내보낸다.</summary>
[CommandStyle(Style.ScriptRunner)]
public sealed class ExportCommand : RhinoCommand
{
    public override string EnglishName => "RhinoViewerExport";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        // 내보내기는 셸만 필요하다. 라이브 패널·HTTP 서버·out/ 디렉터리와 독립이다.
        var shell = Path.Combine(WebRootLocator.PluginDirectory, "rhinoviewer-shell.html");
        if (!File.Exists(shell))
        {
            RhinoApp.WriteLine($"RhinoViewerExport: 내보내기 셸이 없습니다 — {shell}");
            RhinoApp.WriteLine(
                "RhinoViewerExport: node tools/pack-single-html.mjs --page viewer-live --no-scene " +
                "--out dist/rhinoviewer-shell.html 로 만들고 rhp 폴더에 복사하세요.");
            return Result.Failure;
        }

        var dialog = new Rhino.UI.SaveFileDialog
        {
            Title = "RhinoViewer HTML / 실행 파일 내보내기",
            Filter = "HTML (*.html)|*.html|실행 파일 (*.exe)|*.exe",
            DefaultExt = "html",
            FileName = "rhinoviewer.html",
        };
        if (!dialog.ShowSaveDialog())
            return Result.Cancel;

        var target = dialog.FileName;
        var extension = Path.GetExtension(target);
        var executable = extension.Equals(".exe", StringComparison.OrdinalIgnoreCase);
        if (!executable && !extension.Equals(".html", StringComparison.OrdinalIgnoreCase))
        {
            RhinoApp.WriteLine("RhinoViewerExport: .html 또는 .exe 확장자를 고르세요.");
            return Result.Failure;
        }
        var template = Path.Combine(WebRootLocator.PluginDirectory, "RhinoViewerHost.exe");
        if (executable && !File.Exists(template))
        {
            RhinoApp.WriteLine($"RhinoViewerExport: 실행 파일 템플릿이 없습니다 — {template}");
            RhinoApp.WriteLine("RhinoViewerExport: RhinoViewerHost.exe 를 빌드하여 플러그인(.rhp) 옆에 복사하세요.");
            return Result.Failure;
        }

        try
        {
            ExportJob.Start(doc, shell, template, target, executable);
            RhinoApp.WriteLine("RhinoViewerExport: 내보내기를 시작했습니다. 완료 결과는 명령줄에 표시됩니다.");
            return Result.Success;
        }
        catch (Exception ex)
        {
            RhinoApp.WriteLine($"RhinoViewerExport: 실패 — {ex.Message}");
            return Result.Failure;
        }
    }
}
