using System.Globalization;
using System.Text.Json;

namespace RhinoViewer;

internal readonly record struct Vec3(double X, double Y, double Z)
{
    public double[] Array => new[] { X, Y, Z };
}

internal readonly record struct WorldBox(Vec3 Min, Vec3 Max)
{
    public bool Valid => double.IsFinite(Min.X + Min.Y + Min.Z + Max.X + Max.Y + Max.Z) &&
                         Max.X >= Min.X && Max.Y >= Min.Y && Max.Z >= Min.Z;

    public WorldBox Union(WorldBox box) => new(
        new(Math.Min(Min.X, box.Min.X), Math.Min(Min.Y, box.Min.Y), Math.Min(Min.Z, box.Min.Z)),
        new(Math.Max(Max.X, box.Max.X), Math.Max(Max.Y, box.Max.Y), Math.Max(Max.Z, box.Max.Z)));
}

internal readonly record struct SceneFrame(Vec3 Center, double Scale)
{
    public static SceneFrame Calculate(IEnumerable<WorldBox> boxes)
    {
        WorldBox? box = null;
        foreach (var candidate in boxes.Where(candidate => candidate.Valid))
            box = box?.Union(candidate) ?? candidate;

        if (box is not WorldBox bounds)
            return new(new(0, 0, 0), 1);

        var width = bounds.Max.X - bounds.Min.X;
        var depth = bounds.Max.Y - bounds.Min.Y;
        var height = bounds.Max.Z - bounds.Min.Z;
        var maxDimension = Math.Max(width, Math.Max(depth, height));
        var center = new Vec3(bounds.Min.X + width / 2, bounds.Min.Y + depth / 2, bounds.Min.Z + height / 2);
        return new(center, maxDimension > 0 ? 1.5 / maxDimension : 1);
    }
}

internal sealed record BuiltObject(byte[] Payload, WorldBox Box);

internal sealed record SceneObject
{
    public Guid Id { get; }
    public long Rev { get; }
    public byte[] Payload { get; }
    public WorldBox Box { get; init; }
    public string Url { get; }

    public SceneObject(Guid id, long rev, byte[] payload, WorldBox box)
    {
        Id = id;
        Rev = rev;
        Payload = payload;
        Box = box;
        // 객체·리비전은 불변이다. 발행마다 URL 문자열을 다시 만들지 않는다.
        Url = "/live/obj/" + id.ToString("D") + "-" + rev.ToString(CultureInfo.InvariantCulture) + ".rvm";
    }
}

internal sealed record Presentation(
    string Background, string? Camera, IReadOnlyDictionary<Guid, MaterialDescriptor> Materials);

internal static class SceneCounters
{
    private static long _revision;
    private static long _version;

    public static long Revision() => Interlocked.Increment(ref _revision);

    public static long Version() => Interlocked.Increment(ref _version);
}

internal static class SceneJson
{
    public static byte[] Manifest(
        long version, SceneFrame frame, Presentation presentation, IEnumerable<SceneObject> objects)
    {
        return JsonSerializer.SerializeToUtf8Bytes(new
        {
            version,
            center = frame.Center.Array,
            scale = frame.Scale,
            background = presentation.Background,
            camera = Camera(presentation.Camera),
            materials = Materials(presentation),
            objects = objects.Select(obj => new { id = obj.Id.ToString("D"), rev = obj.Rev, url = obj.Url })
        });
    }

    public static IReadOnlyDictionary<string, MaterialJson> Materials(Presentation presentation) =>
        presentation.Materials.ToDictionary(pair => pair.Key.ToString("D"), pair => pair.Value.Json);

    public static JsonElement? Camera(string? json)
    {
        if (json == null)
            return null;

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }
}

internal static class LiveScripts
{
    public const string Pull = "return !!(window.__rhinoPull && window.__rhinoPull() === true)";

    public static string Camera(string json) =>
        "return !!(window.__rhinoSetCamera && window.__rhinoSetCamera(" + json + ") === true)";
}
