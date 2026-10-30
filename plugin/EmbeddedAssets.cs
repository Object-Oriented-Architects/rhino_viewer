using System.IO.Compression;
using System.Text;

namespace RhinoViewer;

internal static class EmbeddedAssets
{
    internal const string ResourceName = "RhinoViewer.Assets.zip";

    private static Stream OpenBundle() =>
        typeof(EmbeddedAssets).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidDataException("임베드 자산이 없습니다. 플러그인을 다시 빌드하세요.");

    public static MemoryFileSource ReadWeb()
    {
        using var bundle = OpenBundle();
        return ReadWeb(bundle);
    }

    internal static MemoryFileSource ReadWeb(Stream bundle)
    {
        using var archive = new ZipArchive(bundle, ZipArchiveMode.Read, leaveOpen: true);
        var files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in archive.Entries)
        {
            if (!entry.FullName.StartsWith("web/", StringComparison.Ordinal) || entry.FullName.EndsWith('/'))
                continue;
            var path = entry.FullName[4..];
            if (path.Contains('\\') || !StaticPath.TryNormalize("/" + path, out var normalized) ||
                normalized != path || !files.TryAdd(path, ReadEntry(entry)))
                throw new InvalidDataException("임베드 웹 경로가 잘못되었습니다: " + entry.FullName);
        }
        if (!files.ContainsKey("viewer-live/index.html"))
            throw new InvalidDataException("임베드 웹 화면이 없습니다.");
        return new MemoryFileSource(files);
    }

    public static (string Shell, Stream? Template) ReadExport(bool executable)
    {
        using var bundle = OpenBundle();
        return ReadExport(bundle, executable);
    }

    internal static (string Shell, Stream? Template) ReadExport(Stream bundle, bool executable)
    {
        // 내보내기 한 번에 ZIP을 한 번만 열고 필요한 항목만 읽는다.
        using var archive = new ZipArchive(bundle, ZipArchiveMode.Read, leaveOpen: true);
        using var stream = new MemoryStream(ReadEntry(Required(archive, "rhinoviewer-shell.html")), writable: false);
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true));
        var shell = reader.ReadToEnd();
        var template = executable
            ? new MemoryStream(ReadEntry(Required(archive, "RhinoViewerHost.exe")), writable: false)
            : null;
        return (shell, template);
    }

    private static ZipArchiveEntry Required(ZipArchive archive, string name) =>
        archive.GetEntry(name) ?? throw new InvalidDataException("임베드 자산이 없습니다: " + name);

    private static byte[] ReadEntry(ZipArchiveEntry entry)
    {
        using var input = entry.Open();
        using var output = new MemoryStream();
        input.CopyTo(output);
        if (output.Length != entry.Length)
            throw new InvalidDataException("임베드 자산 길이가 잘못되었습니다: " + entry.FullName);
        return output.ToArray();
    }
}
