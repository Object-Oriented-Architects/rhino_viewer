using Eto.Forms;

namespace RhinoViewer;

/// <summary>플러그인의 UI 커밋과 로그를 한 경로로 마샬링한다.</summary>
internal sealed class RhinoDispatcher : ISceneDispatcher
{
    public static RhinoDispatcher Shared { get; } = new();

    public void Post(Action action)
    {
        Application.Instance.AsyncInvoke(action);
    }
}
