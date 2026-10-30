namespace RhinoViewer;

/// <summary>
/// 발행과 조회는 같은 락 안에서 한다. 공개한 바이트열은 불변이며 최근 두 매니페스트의 참조를 보관한다.
/// </summary>
internal sealed class MemoryLiveStore
{
    private readonly object _gate = new();
    private readonly Queue<HashSet<string>> _manifests = new();
    private readonly Dictionary<string, byte[]> _payloads = new(StringComparer.Ordinal);
    private byte[]? _state;

    public long Publish(IReadOnlyCollection<SceneObject> objects, SceneFrame frame, Presentation presentation)
    {
        lock (_gate)
        {
            var version = SceneCounters.Version();
            var state = SceneJson.Manifest(version, frame, presentation, objects);
            var urls = new HashSet<string>(StringComparer.Ordinal);
            foreach (var obj in objects)
            {
                _payloads[obj.Url] = obj.Payload;
                urls.Add(obj.Url);
            }

            _manifests.Enqueue(urls);
            while (_manifests.Count > 2)
                _manifests.Dequeue();

            var keep = new HashSet<string>(_manifests.SelectMany(url => url), StringComparer.Ordinal);
            foreach (var key in _payloads.Keys.Where(key => !keep.Contains(key)).ToArray())
                _payloads.Remove(key);

            // 페이로드를 모두 넣은 다음에만 새 매니페스트를 공개한다.
            _state = state;
            return version;
        }
    }

    public bool TryGet(string path, out byte[] bytes)
    {
        lock (_gate)
        {
            if (path == "/live/state.json" && _state != null)
            {
                bytes = _state;
                return true;
            }
            if (_payloads.TryGetValue(path, out var found))
            {
                bytes = found;
                return true;
            }

            bytes = Array.Empty<byte>();
            return false;
        }
    }
}
