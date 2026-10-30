using System.Buffers.Binary;
using System.Text;

namespace RhinoViewer;

/// <summary>C4: 템플릿 + UTF-8 HTML + Int64 LE 바이트 길이 + ASCII 매직.</summary>
internal static class ExecutablePayload
{
    public static void Write(Stream template, string targetPath, Action<Stream> writeHtml)
    {
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
