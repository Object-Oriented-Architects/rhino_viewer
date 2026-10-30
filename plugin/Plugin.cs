using System;
using Rhino.PlugIns;
using Rhino.UI;

namespace RhinoViewer;

/// <summary>
/// RhinoViewer Viewer — Rhino 호스트 플러그인.
/// 렌더링 자체는 이 플러그인이 하지 않는다. WebView2 안에서 웹 렌더러(Next.js 정적 빌드)를 돌리고,
/// 이 플러그인은 (1) 패널 호스팅 (2) 정적 파일 서빙 (3) export 파일 쓰기만 담당한다.
/// </summary>
public sealed class ViewerPlugin : PlugIn
{
    public static ViewerPlugin? Instance { get; private set; }

    public ViewerPlugin()
    {
        Instance = this;
    }

    protected override LoadReturnCode OnLoad(ref string errorMessage)
    {
        try
        {
            Panels.RegisterPanel(this, typeof(ViewerPanel), "RhinoViewer", null);
            return LoadReturnCode.Success;
        }
        catch (Exception ex)
        {
            errorMessage = $"RhinoViewer: 패널 등록 실패 — {ex.Message}";
            return LoadReturnCode.ErrorShowDialog;
        }
    }
}
