namespace RhinoViewer;

internal interface IStaticFileSource
{
    Stream? OpenRead(string path);
}

internal sealed class DiskFileSource : IStaticFileSource
{
    private readonly string _root;
    private readonly string _prefix;

    public DiskFileSource(string root)
    {
        _root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        _prefix = Path.EndsInDirectorySeparator(_root) ? _root : _root + Path.DirectorySeparatorChar;
    }

    public Stream? OpenRead(string path)
    {
        var full = Path.GetFullPath(Path.Combine(_root, path));
        if (!full.StartsWith(_prefix, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            return null;
        return new FileStream(full, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete, 65536,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
    }
}

internal sealed class MemoryFileSource : IStaticFileSource
{
    private readonly Dictionary<string, byte[]> _files;

    public MemoryFileSource(Dictionary<string, byte[]> files) =>
        _files = new(files, StringComparer.OrdinalIgnoreCase);

    public Stream? OpenRead(string path) =>
        _files.TryGetValue(path, out var bytes) ? new MemoryStream(bytes, writable: false) : null;
}

internal static class StaticPath
{
    public static bool TryNormalize(string path, out string normalized)
    {
        normalized = "";
        if (!path.StartsWith('/') || path.IndexOfAny(new[] { ':', '\0' }) >= 0)
            return false;
        var parts = new List<string>();
        foreach (var part in path.Split('/'))
        {
            if (part.Length == 0 || part == ".")
                continue;
            if (part == "..")
            {
                if (parts.Count == 0)
                    return false;
                parts.RemoveAt(parts.Count - 1);
            }
            else
            {
                parts.Add(part);
            }
        }
        normalized = string.Join("/", parts);
        if (normalized.Length == 0 || path.EndsWith('/'))
            normalized += normalized.Length == 0 ? "index.html" : "/index.html";
        return true;
    }
}
