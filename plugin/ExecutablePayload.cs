using System.Buffers.Binary;
using System.Text;

namespace RhinoViewer;

/// <summary>C4: 템플릿 + UTF-8 HTML + Int64 LE 바이트 길이 + ASCII 매직.</summary>
internal static class ExecutablePayload
{
    public static void Write(string templatePath, string targetPath, Action<Stream> writeHtml)
    {
        if (string.Equals(Path.GetFullPath(templatePath), Path.GetFullPath(targetPath), StringComparison.OrdinalIgnoreCase))
        {
            throw new IOException("템플릿 자체에는 내보낼 수 없습니다.");
        }

        using var template = File.OpenRead(templatePath);
        using var output = File.Create(targetPath);
        template.CopyTo(output);
        var start = output.Position;
        writeHtml(output);
        Span<byte> length = stackalloc byte[8];
        BinaryPrimitives.WriteInt64LittleEndian(length, output.Position - start);
        output.Write(length);
        output.Write(Encoding.ASCII.GetBytes("RVHTML01"));
    }
}
