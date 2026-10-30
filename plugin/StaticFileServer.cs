using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace RhinoViewer;

/// <summary>
/// 정적 파일 서버 (loopback 전용, 포트 자동 할당).
///
/// 왜 서버인가: Eto.WebView는 WebView2 백엔드지만 virtual host mapping API를 노출하지 않는다.
/// file:// 로 열면 Rhino3dmLoader/three FileLoader의 fetch가 CORS로 막히므로, 로컬 HTTP로 서빙한다.
/// 외부 노출 없음 — IPAddress.Loopback에만 바인딩한다.
/// </summary>
public sealed class StaticFileServer : IDisposable
{
    private readonly TcpListener _listener;
    private readonly IStaticFileSource _source;
    private readonly MemoryLiveStore _store;
    private readonly CancellationTokenSource _cts = new();

    public int Port { get; }

    /// <param name="source">정적 빌드의 디스크 또는 메모리 소스</param>
    /// <param name="store">불변 라이브 페이로드의 메모리 저장소</param>
    internal StaticFileServer(IStaticFileSource source, MemoryLiveStore store)
    {
        _source = source;
        _store = store;
        _listener = new TcpListener(IPAddress.Loopback, 0);
        _listener.Start();
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        _ = Task.Run(AcceptLoopAsync);
    }

    private async Task AcceptLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(_cts.Token).ConfigureAwait(false);
            }
            catch
            {
                break;
            }

            _ = Task.Run(() => HandleAsync(client));
        }
    }

    private async Task HandleAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, leaveOpen: true);

                var requestLine = await reader.ReadLineAsync().ConfigureAwait(false);
                if (string.IsNullOrEmpty(requestLine))
                    return;

                string? host = null;
                var duplicateHost = false;
                var headerLength = 0;
                while (true)
                {
                    var line = await reader.ReadLineAsync().ConfigureAwait(false);
                    if (string.IsNullOrEmpty(line))
                        break;
                    headerLength += line.Length;
                    if (headerLength > 32768)
                    {
                        await WriteStatusAsync(stream, 403, "Forbidden").ConfigureAwait(false);
                        return;
                    }
                    var colon = line.IndexOf(':');
                    if (colon > 0 && line[..colon].Equals("Host", StringComparison.OrdinalIgnoreCase))
                    {
                        duplicateHost |= host != null;
                        host = line[(colon + 1)..].Trim();
                    }
                }

                if (duplicateHost ||
                    (!string.Equals(host, $"127.0.0.1:{Port}", StringComparison.OrdinalIgnoreCase) &&
                     !string.Equals(host, $"localhost:{Port}", StringComparison.OrdinalIgnoreCase)))
                {
                    await WriteStatusAsync(stream, 403, "Forbidden").ConfigureAwait(false);
                    return;
                }

                var parts = requestLine.Split(' ');
                if (parts.Length < 2)
                    return;

                var urlPath = parts[1];
                var queryIndex = urlPath.IndexOf('?');
                if (queryIndex >= 0)
                    urlPath = urlPath[..queryIndex];

                urlPath = Uri.UnescapeDataString(urlPath).Replace('\\', '/');
                if (!StaticPath.TryNormalize(urlPath, out var path))
                {
                    await WriteStatusAsync(stream, 403, "Forbidden").ConfigureAwait(false);
                    return;
                }
                urlPath = "/" + path;

                if (urlPath.StartsWith("/live/", StringComparison.OrdinalIgnoreCase))
                {
                    if (!_store.TryGet(urlPath, out var bytes))
                    {
                        await WriteStatusAsync(stream, 404, "Not Found").ConfigureAwait(false);
                        return;
                    }
                    var contentType = urlPath == "/live/state.json"
                        ? "application/json; charset=utf-8"
                        : "application/octet-stream";
                    var liveHeader = "HTTP/1.1 200 OK\r\n" +
                        $"Content-Type: {contentType}\r\n" +
                        $"Content-Length: {bytes.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
                    await stream.WriteAsync(Encoding.ASCII.GetBytes(liveHeader)).ConfigureAwait(false);
                    await stream.WriteAsync(bytes).ConfigureAwait(false);
                    await stream.FlushAsync().ConfigureAwait(false);
                    return;
                }
                // 정적 자산은 소스에서 읽고, 라이브 페이로드는 언제나 위 메모리 분기를 쓴다.
                var file = _source.OpenRead(path);
                if (file == null && !path.EndsWith("/index.html", StringComparison.OrdinalIgnoreCase))
                {
                    path += "/index.html";
                    file = _source.OpenRead(path);
                }
                using var content = file;
                if (content == null)
                {
                    await WriteStatusAsync(stream, 404, "Not Found").ConfigureAwait(false);
                    return;
                }
                var header =
                    "HTTP/1.1 200 OK\r\n" +
                    $"Content-Type: {ContentType(path)}\r\n" +
                    $"Content-Length: {content.Length}\r\n" +
                    "Cache-Control: no-store\r\n" +
                    "Connection: close\r\n\r\n";

                await stream.WriteAsync(Encoding.ASCII.GetBytes(header)).ConfigureAwait(false);
                await content.CopyToAsync(stream).ConfigureAwait(false);
                await stream.FlushAsync().ConfigureAwait(false);
            }
            catch
            {
                // 요청 하나 실패는 뷰어를 죽이지 않는다
            }
        }
    }

    private static async Task WriteStatusAsync(NetworkStream stream, int code, string reason)
    {
        var header = $"HTTP/1.1 {code} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(header)).ConfigureAwait(false);
    }

    private static string ContentType(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8",
            ".js" or ".mjs" => "application/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".txt" => "text/plain; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".ico" => "image/x-icon",
            ".woff2" => "font/woff2",
            ".wasm" => "application/wasm",
            ".hdr" => "image/vnd.radiance",
            ".exr" => "image/x-exr",
            ".3dm" => "application/octet-stream",
            ".glb" => "model/gltf-binary",
            ".gltf" => "model/gltf+json",
            _ => "application/octet-stream",
        };

    public void Dispose()
    {
        try { _cts.Cancel(); } catch { }
        try { _listener.Stop(); } catch { }
        _cts.Dispose();
    }
}
