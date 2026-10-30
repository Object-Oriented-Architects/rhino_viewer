using System.Diagnostics;
using System.Text.Json;
using RhinoViewer;

internal static partial class Program
{
    private static readonly Guid TestMaterial = new("00112233-4455-6677-8899-aabbccddeeff");

    private static Dictionary<Guid, MaterialDescriptor> TestMaterials() => new()
    {
        [TestMaterial] = MaterialDescriptor.Create(2, new(0.878, 0.067, 0.373), ior: 1.76, opacity: 0)
    };

    private static void MaterialResolution()
    {
        var objectMaterial = Guid.NewGuid();
        var layerMaterial = Guid.NewGuid();
        var parentMaterial = Guid.NewGuid();
        Guid Lookup(int index) => index == 3 ? objectMaterial : index == 4 ? layerMaterial : Guid.Empty;
        Equal(objectMaterial, MaterialRules.Resolve(MaterialSource.Object, 3, 4, parentMaterial, Lookup));
        Equal(layerMaterial, MaterialRules.Resolve(MaterialSource.Layer, 3, 4, parentMaterial, Lookup));
        Equal(parentMaterial, MaterialRules.Resolve(MaterialSource.Parent, 3, 4, parentMaterial, Lookup));
        Equal(layerMaterial, MaterialRules.Resolve(MaterialSource.Parent, 3, 4, null, Lookup));
        Equal(Guid.Empty, MaterialRules.Resolve(MaterialSource.Object, -1, 4, parentMaterial, Lookup));
        Equal(Guid.Empty, MaterialRules.Resolve(MaterialSource.Layer, 3, -1, parentMaterial, Lookup));
        // 부모의 재질 없음도 상속하며 자식 레이어로 되돌아가지 않는다.
        Equal(Guid.Empty, MaterialRules.Resolve(MaterialSource.Parent, 3, 4, Guid.Empty, Lookup));
        var outer = MaterialRules.Resolve(MaterialSource.Object, 3, 4, null, Lookup);
        var inner = MaterialRules.Resolve(MaterialSource.Parent, -1, 4, outer, Lookup);
        Equal(objectMaterial, MaterialRules.Resolve(MaterialSource.Parent, -1, 4, inner, Lookup));
        Equal(layerMaterial, MaterialRules.Resolve(MaterialSource.Layer, -1, 4, inner, Lookup));
        Equal(Guid.Empty, MaterialRules.Resolve(MaterialSource.Object, 999, 4, inner, Lookup));
    }

    private static void MaterialImpact()
    {
        var references = new MaterialReferences();
        var top = Guid.NewGuid();
        var other = Guid.NewGuid();
        var missing = Guid.NewGuid();
        var replacement = Guid.NewGuid();
        var available = TestMaterials();
        var read = new HashSet<Guid>();
        Equal<MaterialDescriptor?>(null, MaterialRules.Read(missing, read, id => available.GetValueOrDefault(id)));
        Equal(available[TestMaterial], MaterialRules.Read(TestMaterial, read, id => available.GetValueOrDefault(id)));
        Check(read.Contains(missing), "Find 실패 참조 id가 사라짐");
        references.Set(top, read);
        references.Set(other, new[] { replacement });
        available[missing] = MaterialDescriptor.Create(1, new(1, 0, 0));
        var update = MaterialRules.EventImpact(null, available[missing], MaterialEvent.Added, true);
        Equal(MaterialUpdate.Dirty, update);
        var dirty = update == MaterialUpdate.Dirty
            ? references.Affected(new HashSet<Guid> { missing }) : Array.Empty<Guid>();
        Check(dirty.SequenceEqual(new[] { top }), "실패했던 참조의 Added가 해당 객체를 찾지 못함");
        Check(references.Affected(new HashSet<Guid> { TestMaterial }).SequenceEqual(new[] { top }));
        Check(references.Affected(new HashSet<Guid> { missing, replacement }).ToHashSet().SetEquals(new[] { top, other }));
        references.Set(top, new[] { replacement });
        Equal(0, references.Affected(new HashSet<Guid> { missing }).Length);
        references.Remove(other);
        Check(references.Affected(new HashSet<Guid> { replacement }).SequenceEqual(new[] { top }));
        references.Clear();
        Equal(0, references.Affected(new HashSet<Guid> { replacement }).Length);
    }

    private static void MaterialEvents()
    {
        var general = MaterialDescriptor.Create(1, new(0.2, 0.3, 0.4));
        var changed = MaterialDescriptor.Create(1, new(0.7, 0.3, 0.4));
        var gem = TestMaterials()[TestMaterial];
        var cases = new List<(string Name, MaterialDescriptor? Before, MaterialDescriptor? After,
            MaterialEvent Event, bool TopLevel, bool Ignore, MaterialUpdate Expected)>
        {
            ("없는 값 동일", null, null, MaterialEvent.Changed, true, false, MaterialUpdate.Ignore),
            ("새 기술자지만 값 동일", general, general with { }, MaterialEvent.Changed, true, false, MaterialUpdate.Ignore),
            ("값만 변경", general, changed, MaterialEvent.Changed, true, false, MaterialUpdate.Metadata),
            ("kind 변경", general, gem, MaterialEvent.Changed, true, false, MaterialUpdate.Dirty),
            ("재질 해석 복구", null, general, MaterialEvent.Changed, true, false, MaterialUpdate.Dirty),
            ("재질 해석 실패", general, null, MaterialEvent.Changed, true, false, MaterialUpdate.Dirty)
        };
        foreach (var change in new[] { MaterialEvent.Added, MaterialEvent.Deleted, MaterialEvent.Replaced })
        {
            cases.Add(($"최상위 {change} 값 동일", general, general with { }, change, true, false, MaterialUpdate.Dirty));
            cases.Add(($"최상위 {change} 해석 실패", null, null, change, true, false, MaterialUpdate.Dirty));
            cases.Add(($"하위 {change} 값 동일", general, general with { }, change, false, false, MaterialUpdate.Ignore));
            cases.Add(($"하위 {change} 값 변경", general, changed, change, false, false, MaterialUpdate.Metadata));
            cases.Add(($"하위 {change} 부모 kind 변경", general, gem, change, false, false, MaterialUpdate.Dirty));
        }
        foreach (var change in Enum.GetValues<MaterialEvent>())
        {
            foreach (var topLevel in new[] { true, false })
                cases.Add(($"Ignore {change} 최상위={topLevel}", general, gem, change, topLevel, true, MaterialUpdate.Ignore));
        }
        foreach (var item in cases)
            Check(item.Expected == MaterialRules.EventImpact(item.Before, item.After, item.Event, item.TopLevel, item.Ignore),
                "이벤트 판정: " + item.Name);

        foreach (var value in new[]
        {
            changed,
            MaterialDescriptor.Create(1, general.Color, metallic: 0.6),
            MaterialDescriptor.Create(1, general.Color, roughness: 0.6),
            MaterialDescriptor.Create(1, general.Color, ior: 1.6),
            MaterialDescriptor.Create(1, general.Color, opacity: 0.6),
            MaterialDescriptor.Create(1, general.Color, clearcoat: 0.6),
            MaterialDescriptor.Create(1, general.Color, clearcoatRoughness: 0.6)
        })
        {
            Equal(MaterialUpdate.Metadata, MaterialRules.EventImpact(general, value, MaterialEvent.Changed, true));
            // 시뮬레이션이 나중에 같은 값으로 알리는 이벤트는 더 발행하지 않는다.
            Equal(MaterialUpdate.Ignore, MaterialRules.EventImpact(value, value with { }, MaterialEvent.Changed, true));
        }
    }

    private static void MaterialValues()
    {
        Equal((byte)2, MaterialRules.Kind(MaterialRules.GemType));
        foreach (var type in new[] { "037469d6-0b9a-4e5f-af10-e483c992993a",
            "51b4af08-9dec-4744-86f9-546fbacb800d", "5a8d7b9b-cdc9-49de-8c16-2ef64fb097ab" })
            Equal((byte)1, MaterialRules.Kind(new Guid(type)));
        var gem = TestMaterials()[TestMaterial];
        var general = MaterialDescriptor.Create(1, new(1, 0, 0));
        Check(!MaterialRules.KindChanged(gem, gem with { }));
        Check(MaterialRules.KindChanged(gem, general));
        Check(MaterialRules.KindChanged(null, gem));
        Check(MaterialRules.KindChanged(general, null));
        Check(!MaterialRules.KindChanged(null, null));
        var invalid = MaterialDescriptor.Create(1, new(double.NaN, -3, 2), double.PositiveInfinity,
            -1, 0, 2, double.NaN, double.NegativeInfinity);
        Equal(new Vec3(1, 0, 1), invalid.Color);
        Equal(0d, invalid.Metallic);
        Equal(0d, invalid.Roughness);
        Equal(1d, invalid.Ior);
        Equal(1d, invalid.Opacity);
        Equal(0d, invalid.Clearcoat);
        Equal(0d, invalid.ClearcoatRoughness);
        using var json = JsonDocument.Parse(SceneJson.Manifest(1, new(new(0, 0, 0), 1),
            new("#fff", null, TestMaterials()), Array.Empty<SceneObject>()));
        var material = json.RootElement.GetProperty("materials").GetProperty(TestMaterial.ToString("D"));
        Check(material.EnumerateObject().Select(property => property.Name).ToHashSet().SetEquals(new[]
            { "kind", "color", "metallic", "roughness", "ior", "opacity", "clearcoat", "clearcoatRoughness" }));
        Equal(2, material.GetProperty("kind").GetInt32());
        Check(material.GetProperty("color").EnumerateArray().Select(value => value.GetDouble())
            .SequenceEqual(new[] { 0.878, 0.067, 0.373 }));
        Equal(0d, material.GetProperty("metallic").GetDouble());
        Equal(0.5, material.GetProperty("roughness").GetDouble());
        Equal(1.76, material.GetProperty("ior").GetDouble());
        Equal(0d, material.GetProperty("opacity").GetDouble());
        Equal(0d, material.GetProperty("clearcoat").GetDouble());
        Equal(0d, material.GetProperty("clearcoatRoughness").GetDouble());
    }

    private static void MaterialMetadata()
    {
        var fake = new Fake();
        var id = Guid.NewGuid();
        fake.Objects[id] = Built();
        fake.Materials = TestMaterials();
        var ui = new Dispatcher();
        var store = new MemoryLiveStore();
        var engine = new IncrementalScene(fake, ui, store);
        engine.Reset(new[] { id });
        engine.Start();
        ui.Until(() => !engine.Running);
        var revision = Revisions(store)[id];
        var calls = fake.Calls;
        using var before = JsonDocument.Parse(Get(store));
        Equal(0.878, before.RootElement.GetProperty("materials").GetProperty(TestMaterial.ToString("D"))
            .GetProperty("color")[0].GetDouble());
        var added = Guid.NewGuid();
        fake.Materials = new()
        {
            [TestMaterial] = MaterialDescriptor.Create(2, new(0, 0, 1), ior: 1.76, opacity: 0),
            [added] = MaterialDescriptor.Create(1, new(0, 1, 0))
        };
        engine.MetadataDirty();
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(calls, fake.Calls);
        Equal(revision, Revisions(store)[id]);
        using var after = JsonDocument.Parse(Get(store));
        Check(after.RootElement.GetProperty("version").GetInt64() > before.RootElement.GetProperty("version").GetInt64());
        var table = after.RootElement.GetProperty("materials");
        Equal(2, table.EnumerateObject().Count());
        Check(table.GetProperty(TestMaterial.ToString("D")).GetProperty("color").EnumerateArray()
            .Select(value => value.GetDouble()).SequenceEqual(new[] { 0d, 0d, 1d }));
        Equal(1.76, table.GetProperty(TestMaterial.ToString("D")).GetProperty("ior").GetDouble());
        Equal(1, table.GetProperty(added.ToString("D")).GetProperty("kind").GetInt32());
        Equal(1d, table.GetProperty(added.ToString("D")).GetProperty("color")[1].GetDouble());
    }

    private static void WebProtocol()
    {
        var payload = Path.Combine(Temp, "material.rvm");
        var manifest = Path.Combine(Temp, "material.json");
        File.WriteAllBytes(payload, MeshPayload.Write(Small()));
        File.WriteAllBytes(manifest, SceneJson.Manifest(1, new(new(0, 0, 0), 1),
            new("#fff", null, TestMaterials()), Array.Empty<SceneObject>()));
        using (var export = File.Create(Path.Combine(Temp, "material.rvs")))
            SceneExport.WriteRvs(export, new[] { Object() }, new(new(0, 0, 0), 1),
                new("#fff", null, TestMaterials()));
        var start = new ProcessStartInfo("node")
        {
            WorkingDirectory = Root, RedirectStandardOutput = true, RedirectStandardError = true
        };
        start.ArgumentList.Add(Path.Combine(Root, "tools", "test-scene-materials.mjs"));
        start.ArgumentList.Add(payload);
        start.ArgumentList.Add(manifest);
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Check(process.ExitCode == 0, stdout.Result + stderr.Result);
    }
}
