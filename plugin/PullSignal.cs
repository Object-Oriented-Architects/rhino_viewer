namespace RhinoViewer;

internal readonly record struct PullRequest(long Revision, long Page, int Attempt);

/// <summary>
/// UI 스레드에서만 쓰는 pull 신호 상태기계.
/// 완료된 요청까지만 확인하므로 실행 중 도착한 다음 발행 신호를 지우지 않는다.
/// </summary>
internal sealed class PullSignal
{
    private long _requested;
    private long _served;
    private long _attempted;
    private long _page;
    private int _attempts;
    private PullRequest? _inFlight;

    public void Signal()
    {
        _requested++;
    }

    public void ResetPage()
    {
        _page++;
        _served = _requested;
        _attempts = 0;
        _inFlight = null;
    }

    public bool TryBegin(out PullRequest request)
    {
        request = default;
        if (_inFlight != null || _served >= _requested)
            return false;

        if (_attempted != _requested)
        {
            _attempted = _requested;
            _attempts = 0;
        }
        if (_attempts >= 2)
            return false;

        request = new PullRequest(_requested, _page, ++_attempts);
        _inFlight = request;
        return true;
    }

    public void Complete(PullRequest request, bool accepted)
    {
        if (_inFlight != request)
            return;

        _inFlight = null;
        if (accepted)
            _served = Math.Max(_served, request.Revision);
    }
}

/// <summary>Import와 참조 파일 열기는 기존 장면을 유지하고 Add 이벤트만 처리한다.</summary>
internal static class DocumentChangePolicy
{
    public static bool ShouldReset(bool active, bool merge = false, bool reference = false)
    {
        return active && !merge && !reference;
    }
}
