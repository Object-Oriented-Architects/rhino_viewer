using System.Diagnostics;

namespace RhinoViewer;

internal interface ISceneSnapshot : IDisposable
{
    BuiltObject? Build();
}

internal interface ISceneDocument
{
    // UI에서 문서와 분리한 사본만 넘긴다. 메시화는 Build의 백그라운드 작업이다.
    ISceneSnapshot? Capture(Guid id);

    // 메시화 시작 때가 아닌 UI 커밋 시점의 카메라·배경색을 읽는다.
    Presentation Presentation(SceneFrame frame);
}

internal interface ISceneDispatcher
{
    void Post(Action action);
}

/// <summary>
/// Rhino와 분리된 증분 정책. 변경·캡처·커밋은 UI에서, 소유권을 넘긴 사본의 Build만 백그라운드에서 실행한다.
/// 객체 세대와 문서 세대를 함께 비교하여 편집·삭제·문서 전환 전의 결과가 되살아나지 않게 한다.
/// </summary>
internal sealed class IncrementalScene
{
    private readonly ISceneDocument _document;
    private readonly ISceneDispatcher _dispatcher;
    private readonly MemoryLiveStore _store;
    private readonly Dictionary<Guid, SceneObject> _cache = new();
    private readonly Dictionary<Guid, long> _generations = new();
    private readonly HashSet<Guid> _deleted = new();
    private readonly HashSet<Guid> _dirty = new();
    private long _epoch;
    private bool _metadata;

    public bool Visible { get; set; } = true;
    public bool Running { get; private set; }
    public bool HasPending => _metadata || _dirty.Count != 0;

    public event Action? Preparing;
    public event Action<SceneFrame>? Published;
    public event Action<Exception>? Failed;

    public IncrementalScene(ISceneDocument document, ISceneDispatcher dispatcher, MemoryLiveStore store)
    {
        _document = document;
        _dispatcher = dispatcher;
        _store = store;
    }

    public void Dirty(Guid id, bool isDefinitionGeometry = false)
    {
        if (isDefinitionGeometry)
            return;

        _generations[id] = _generations.GetValueOrDefault(id) + 1;
        _deleted.Remove(id);
        _dirty.Add(id);
    }

    public void Delete(Guid id)
    {
        _generations[id] = _generations.GetValueOrDefault(id) + 1;
        _deleted.Add(id);
        _dirty.Remove(id);
        _metadata = true;
        // Replace의 Delete→Add 사이에는 옛 메시를 유지한다. 실제 제거는 커밋까지 미룬다.
    }

    public void Reset(IEnumerable<Guid> ids)
    {
        _epoch++;
        _cache.Clear();
        _dirty.Clear();
        _generations.Clear();
        _deleted.Clear();
        _metadata = true;
        foreach (var id in ids)
            Dirty(id);
    }

    public void MetadataDirty() => _metadata = true;

    public void Start()
    {
        if (Running || !Visible || !HasPending)
            return;

        try
        {
            // 테이블 이벤트를 모아 사이클당 한 번만 의존 관계를 계산한다.
            Preparing?.Invoke();
        }
        catch (Exception ex)
        {
            Failed?.Invoke(ex);
            return;
        }

        Running = true;
        var cycle = new Cycle(_epoch, _dirty.Select(id => new PendingObject(id, _generations[id])));
        _dirty.Clear();
        _metadata = false;
        CaptureSlice(cycle);
    }

    private void CaptureSlice(Cycle cycle)
    {
        if (cycle.Epoch != _epoch || !Visible)
        {
            foreach (var item in cycle.Captured)
                item.Snapshot?.Dispose();
            if (cycle.Epoch == _epoch)
            {
                foreach (var item in cycle.Captured)
                    Requeue(item.Id);
                foreach (var item in cycle.Pending)
                    Requeue(item.Id);
                _metadata = true;
            }
            Finish();
            return;
        }

        var watch = Stopwatch.StartNew();
        while (cycle.Pending.TryDequeue(out var item))
        {
            if (!Current(item.Id, item.Generation))
                continue;

            ISceneSnapshot? snapshot = null;
            try
            {
                snapshot = _document.Capture(item.Id);
            }
            catch (Exception ex)
            {
                Failed?.Invoke(ex);
            }
            cycle.Captured.Add(new(item.Id, item.Generation, snapshot));
            if (watch.ElapsedMilliseconds >= 10 && cycle.Pending.Count != 0)
            {
                _dispatcher.Post(() => CaptureSlice(cycle));
                return;
            }
        }

        _ = Task.Run(() => Build(cycle));
    }

    private void Requeue(Guid id)
    {
        if (!_deleted.Contains(id))
            _dirty.Add(id);
    }

    private bool Current(Guid id, long generation) =>
        !_deleted.Contains(id) && _generations.GetValueOrDefault(id) == generation;

    private void Build(Cycle cycle)
    {
        var results = new List<BuildResult>();
        var failures = new List<Exception>();
        foreach (var item in cycle.Captured)
        {
            BuiltObject? built = null;
            try
            {
                built = item.Snapshot?.Build();
            }
            catch (Exception ex)
            {
                failures.Add(ex);
            }
            finally
            {
                try
                {
                    item.Snapshot?.Dispose();
                }
                catch (Exception ex)
                {
                    failures.Add(ex);
                }
            }
            results.Add(new(item.Id, item.Generation, built));
        }
        _dispatcher.Post(() => Commit(cycle.Epoch, results, failures));
    }

    private void Commit(long epoch, List<BuildResult> results, List<Exception> failures)
    {
        try
        {
            foreach (var error in failures)
                Failed?.Invoke(error);
            if (epoch != _epoch)
                return;

            // 빌드 중 도착한 테이블 변경도 커밋 전에 한 번 해석하여 오래된 결과의 세대를 걸러낸다.
            Preparing?.Invoke();
            foreach (var result in results)
            {
                if (!Current(result.Id, result.Generation))
                    continue;
                if (result.Built is not BuiltObject built)
                {
                    _cache.Remove(result.Id);
                    continue;
                }

                // .NET gzip 출력은 같은 RVM2 입력에 결정적이다(헤더 시각 없음).
                // kind·origin·인덱스를 포함한 전체 바이트가 같을 때만 rev와 기존 페이로드를 재사용한다.
                if (_cache.TryGetValue(result.Id, out var previous) &&
                    previous.Payload.AsSpan().SequenceEqual(built.Payload))
                {
                    _cache[result.Id] = previous with { Box = built.Box };
                }
                else
                {
                    _cache[result.Id] = new(result.Id, SceneCounters.Revision(), built.Payload, built.Box);
                }
            }

            foreach (var id in _deleted)
            {
                if (!_dirty.Contains(id))
                    _cache.Remove(id);
            }
            if (!Visible)
            {
                _metadata = true;
                return;
            }

            var objects = _cache.Values.Where(obj => !_deleted.Contains(obj.Id)).ToArray();
            var frame = SceneFrame.Calculate(objects.Select(obj => obj.Box));
            var presentation = _document.Presentation(frame);
            _store.Publish(objects, frame, presentation);
            Published?.Invoke(frame);
        }
        catch (Exception ex)
        {
            Failed?.Invoke(ex);
        }
        finally
        {
            Finish();
        }
    }

    private void Finish()
    {
        Running = false;
        if (Visible && HasPending)
            Start();
    }

    private readonly record struct PendingObject(Guid Id, long Generation);
    private sealed record CapturedObject(Guid Id, long Generation, ISceneSnapshot? Snapshot);
    private sealed record BuildResult(Guid Id, long Generation, BuiltObject? Built);

    private sealed class Cycle
    {
        public long Epoch { get; }
        public Queue<PendingObject> Pending { get; }
        public List<CapturedObject> Captured { get; } = new();

        public Cycle(long epoch, IEnumerable<PendingObject> pending)
        {
            Epoch = epoch;
            Pending = new(pending);
        }
    }
}
