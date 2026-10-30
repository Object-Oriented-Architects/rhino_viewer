using System.IO.Compression;
using System.Text;
using RhinoViewer;

internal static partial class Program
{
    private static MemoryStream Bundle(params (string Path, byte[] Bytes)[] files)
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var file in files)
            {
                using var entry = archive.CreateEntry(file.Path, CompressionLevel.Optimal).Open();
                entry.Write(file.Bytes);
            }
        }
        stream.Position = 0;
        return stream;
    }

    private static void InvalidBundle(Action read)
    {
        try
        {
            read();
        }
        catch (InvalidDataException)
        {
            return;
        }
        throw new InvalidOperationException("잘못된 임베드 묶음을 허용했습니다.");
    }

    private static void AssetBundle()
    {
        const string shell = "<!doctype html><head>한글</head><body>셸</body>";
        var html = Encoding.UTF8.GetBytes("패널");
        var template = new byte[] { 77, 90, 1, 2, 3 };
        using var bundle = Bundle(
            ("web/viewer-live/index.html", html),
            ("web/empty.txt", Array.Empty<byte>()),
            ("rhinoviewer-shell.html", Encoding.UTF8.GetBytes(shell)),
            ("RhinoViewerHost.exe", template));
        var source = EmbeddedAssets.ReadWeb(bundle);
        Check(bundle.CanRead, "묶음 입력의 소유권을 가져가면 안 됩니다");
        using (var page = source.OpenRead("viewer-live/index.html"))
        {
            Check(page != null);
            using var bytes = new MemoryStream();
            page!.CopyTo(bytes);
            Bytes(html, bytes.ToArray());
        }
        Check(source.OpenRead("rhinoviewer-shell.html") == null);
        Check(source.OpenRead("missing") == null);
        using (var empty = source.OpenRead("empty.txt")) Equal(0L, empty!.Length);
        bundle.Position = 0;
        var htmlOnly = EmbeddedAssets.ReadExport(bundle, executable: false);
        Equal(shell, htmlOnly.Shell);
        Check(htmlOnly.Template == null);
        bundle.Position = 0;
        var export = EmbeddedAssets.ReadExport(bundle, executable: true);
        Equal(shell, export.Shell);
        using var executable = export.Template!;
        bundle.Dispose();
        using var copy = new MemoryStream();
        executable.CopyTo(copy);
        Bytes(template, copy.ToArray());

        using var missing = Bundle();
        InvalidBundle(() => EmbeddedAssets.ReadWeb(missing));
        missing.Position = 0;
        InvalidBundle(() => EmbeddedAssets.ReadExport(missing, executable: false));
        missing.Position = 0;
        InvalidBundle(() => EmbeddedAssets.ReadExport(missing, executable: true));
        using var shellOnly = Bundle(("rhinoviewer-shell.html", Encoding.UTF8.GetBytes(shell)));
        Equal(shell, EmbeddedAssets.ReadExport(shellOnly, executable: false).Shell);
        shellOnly.Position = 0;
        InvalidBundle(() => EmbeddedAssets.ReadExport(shellOnly, executable: true));
        using var corrupt = new MemoryStream(new byte[] { 1, 2, 3 });
        InvalidBundle(() => EmbeddedAssets.ReadWeb(corrupt));
        // 테스트 어셈블리에는 프로덕션 리소스가 없다. 폴더 탐색으로 우회하면 안 된다.
        InvalidBundle(() => EmbeddedAssets.ReadWeb());
        InvalidBundle(() => EmbeddedAssets.ReadExport(executable: false));
        InvalidBundle(() => EmbeddedAssets.ReadExport(executable: true));
        foreach (var path in new[] { "../secret", "a/../../secret", "a/../secret", "C:/secret", "a\\secret" })
        {
            using var invalid = Bundle(("web/" + path, html), ("web/viewer-live/index.html", html));
            InvalidBundle(() => EmbeddedAssets.ReadWeb(invalid));
        }
        using var duplicate = Bundle(("web/viewer-live/index.html", html), ("web/VIEWER-LIVE/index.html", html));
        InvalidBundle(() => EmbeddedAssets.ReadWeb(duplicate));
        var zipBytes = BundleBytes();
        using var truncated = new MemoryStream(zipBytes[..^16]);
        InvalidBundle(() => EmbeddedAssets.ReadWeb(truncated));
    }

    private static byte[] BundleBytes()
    {
        using var bundle = Bundle(("web/viewer-live/index.html", Encoding.UTF8.GetBytes("hello")));
        return bundle.ToArray();
    }

    private static void DiskSourceBoundary()
    {
        var root = Path.Combine(Temp, "disk-root");
        var sibling = root + "-sibling";
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(sibling);
        File.WriteAllText(Path.Combine(root, "inside.txt"), "PUBLIC");
        var outside = Path.Combine(Temp, "disk-secret.txt");
        File.WriteAllText(outside, "PRIVATE");
        File.WriteAllText(Path.Combine(sibling, "secret.txt"), "PRIVATE");
        var source = new DiskFileSource(root);
        using var inside = source.OpenRead("inside.txt");
        Check(inside != null);
        using var reader = new StreamReader(inside!);
        Equal("PUBLIC", reader.ReadToEnd());
        // HTTP 정규화를 우회해 소스 자체의 접두사 가드를 직접 검사한다.
        foreach (var path in new[] { "../disk-secret.txt", outside, "../disk-root-sibling/secret.txt" })
        {
            using var escaped = source.OpenRead(path);
            Check(escaped == null, "디스크 소스가 루트 밖 파일을 열었습니다: " + path);
        }
    }

    private static async Task MemoryServer()
    {
        var obj = Object();
        var files = new Dictionary<string, byte[]>
        {
            ["index.html"] = Encoding.UTF8.GetBytes("root"),
            ["viewer-live/index.html"] = Encoding.UTF8.GetBytes("패널"),
            ["assets/한글.js"] = Encoding.UTF8.GetBytes("script"),
            ["assets/site.css"] = new byte[] { 1 },
            ["assets/data.json"] = new byte[] { 2 },
            ["assets/env.hdr"] = new byte[] { 3 },
            ["assets/codec.wasm"] = new byte[] { 4 },
            ["assets/file.bin"] = new byte[] { 5 },
            ["live/state.json"] = Encoding.UTF8.GetBytes("DISK FALLBACK"),
            ["live/missing.bin"] = new byte[] { 99 },
            [obj.Url.TrimStart('/')] = new byte[] { 99 }
        };
        var store = new MemoryLiveStore();
        using var server = new StaticFileServer(new MemoryFileSource(files), store);
        foreach (var path in new[] { "/viewer-live/", "/viewer-live", "/viewer-live/index.html?x=1", "/a/../viewer-live/", "/./viewer-live//", "/viewer-live%5c", "/VIEWER-LIVE/" })
        {
            var response = await Request(server.Port, path);
            Equal(200, response.Status);
            Equal("패널", Encoding.UTF8.GetString(response.Body));
            Check(response.Headers.Contains("Content-Type: text/html; charset=utf-8"));
            Check(response.Headers.Contains("Cache-Control: no-store"));
        }
        Equal("root", Encoding.UTF8.GetString((await Request(server.Port, "/")).Body));
        var script = await Request(server.Port, "/assets/%ED%95%9C%EA%B8%80.js");
        Equal(200, script.Status);
        Equal("script", Encoding.UTF8.GetString(script.Body));
        Check(script.Headers.Contains("Content-Type: application/javascript; charset=utf-8"));
        foreach (var (path, mime) in new[] { ("site.css", "text/css; charset=utf-8"), ("data.json", "application/json; charset=utf-8"), ("env.hdr", "image/vnd.radiance"), ("codec.wasm", "application/wasm"), ("file.bin", "application/octet-stream") })
        {
            var response = await Request(server.Port, "/assets/" + path);
            Equal(200, response.Status);
            Check(response.Headers.Contains("Content-Type: " + mime));
        }
        foreach (var path in new[] { "/missing", "/missing/", "/live/state.json", "/live/missing.bin" })
            Equal(404, (await Request(server.Port, path)).Status);
        foreach (var path in new[] { "/../index.html", "/%2e%2e/index.html", "/..%5cindex.html", "/a/../../index.html", "/C:/secret", "/assets/file.bin:stream", "/%00" })
            Equal(403, (await Request(server.Port, path)).Status);
        store.Publish(new[] { obj }, SceneFrame.Calculate(new[] { obj.Box }), new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
        var state = await Request(server.Port, "/live/state.json");
        Equal(200, state.Status);
        Check(state.Headers.Contains("Content-Type: application/json; charset=utf-8"));
        Check(!Encoding.UTF8.GetString(state.Body).Contains("DISK FALLBACK"));
        var payload = await Request(server.Port, obj.Url);
        Bytes(obj.Payload, payload.Body);
        Check(payload.Headers.Contains("Content-Type: application/octet-stream"));
    }

    private static void StreamTemplate()
    {
        var template = new byte[] { 77, 90, 3, 4 };
        var html = Encoding.UTF8.GetBytes("<head>한글</head>");
        using var input = new ForwardStream(template);
        var target = Path.Combine(Temp, "stream.exe");
        ExecutablePayload.Write(input, target, stream => stream.Write(html));
        Check(input.CanRead, "호출자가 템플릿 스트림을 닫는다");
        var actual = File.ReadAllBytes(target);
        Bytes(template, actual[..template.Length]);
        Bytes(html, actual[template.Length..^16]);
        Equal((long)html.Length, System.Buffers.Binary.BinaryPrimitives.ReadInt64LittleEndian(actual.AsSpan(actual.Length - 16)));
        Equal("RVHTML01", Encoding.ASCII.GetString(actual[^8..]));
    }

    private sealed class ForwardStream : Stream
    {
        private readonly MemoryStream _input;
        public ForwardStream(byte[] bytes) => _input = new(bytes, writable: false);
        public override bool CanRead => _input.CanRead;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => _input.Read(buffer, offset, count);
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing) _input.Dispose();
            base.Dispose(disposing);
        }
    }
}
