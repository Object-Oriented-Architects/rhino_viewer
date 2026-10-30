using Rhino;
using Rhino.DocObjects;
using Rhino.Render;

namespace RhinoViewer;

/// <summary>문서 UI 스레드에서만 해석·시뮬레이션하며 메시 캐시와는 독립적으로 유지한다.</summary>
internal sealed class RhinoMaterials
{
    private readonly Dictionary<Guid, MaterialDescriptor?> _descriptors = new();
    // 라이브와 내보내기 어댑터가 같은 플러그인 조회 가드를 공유한다.
    private static int _reading;
    public static bool Reading => Volatile.Read(ref _reading) != 0;
    public MaterialReferences References { get; } = new();

    public Guid Resolve(RhinoDoc doc, ObjectAttributes attributes, Guid? parent)
    {
        var source = attributes.MaterialSource switch
        {
            ObjectMaterialSource.MaterialFromObject => MaterialSource.Object,
            ObjectMaterialSource.MaterialFromParent => MaterialSource.Parent,
            _ => MaterialSource.Layer
        };
        return MaterialRules.Resolve(source, attributes.MaterialIndex,
            doc.Layers[attributes.LayerIndex]?.RenderMaterialIndex ?? -1, parent,
            index => index < doc.Materials.Count ? doc.Materials[index].RenderMaterialInstanceId : Guid.Empty);
    }

    public MaterialDescriptor? Get(RhinoDoc doc, Guid id)
    {
        if (id == Guid.Empty)
            return null;
        if (_descriptors.TryGetValue(id, out var cached))
            return cached;
        Interlocked.Increment(ref _reading);
        try
        {
            // RenderMaterial 게터는 문서를 바꿀 수 있다. 존재하는 instance id만 찾는다.
            var render = doc.RenderMaterials.Find(id);
            if (render == null)
                return _descriptors[id] = null;
            var kind = MaterialRules.Kind(render.TypeId);
            try
            {
                using var material = render.ToMaterial(RenderTexture.TextureGeneration.Skip);
                if (!material.IsPhysicallyBased)
                    material.ToPhysicallyBased();
                var pbr = material.PhysicallyBased;
                var color = pbr.BaseColor;
                return _descriptors[id] = MaterialDescriptor.Create(kind,
                    new(color.R, color.G, color.B), pbr.Metallic, pbr.Roughness, pbr.OpacityIOR,
                    pbr.Opacity, pbr.Clearcoat, pbr.ClearcoatRoughness);
            }
            catch (Exception ex)
            {
                // 시뮬레이션 오류도 객체를 버리지 않는다. 해당 재질 변경 시 다시 시도한다.
                RhinoApp.WriteLine("RhinoViewer: 재질 읽기 실패 — " + ex.Message);
                return _descriptors[id] = MaterialDescriptor.Create(kind, new(1, 1, 1));
            }
        }
        finally
        {
            Interlocked.Decrement(ref _reading);
        }
    }

    public IReadOnlyDictionary<Guid, MaterialDescriptor> Table(RhinoDoc doc)
    {
        Interlocked.Increment(ref _reading);
        try
        {
            var table = new Dictionary<Guid, MaterialDescriptor>();
            foreach (var render in doc.RenderMaterials)
            {
                if (Get(doc, render.Id) is MaterialDescriptor descriptor)
                    table[render.Id] = descriptor;
            }
            return table;
        }
        finally
        {
            Interlocked.Decrement(ref _reading);
        }
    }

    public MaterialUpdate Changed(
        RhinoDoc doc, Guid id, MaterialEvent change, bool topLevel, bool ignoreContext)
    {
        _descriptors.TryGetValue(id, out var before);
        var after = before;
        if (!ignoreContext)
        {
            _descriptors.Remove(id);
            after = Get(doc, id);
        }
        // 조회 가드는 동기 재진입만 막는다. 늦게 오는 시뮬레이션 이벤트가 있어도 값이 같으면 발행하지 않는다.
        // Rhino 8 실측(2026-10-30): 편집 뒤 유휴 12초 동안 ToMaterial 재계산이 ContentChanged를 다시 일으키지 않았다.
        return MaterialRules.EventImpact(before, after, change, topLevel, ignoreContext);
    }

    public void Clear()
    {
        _descriptors.Clear();
        References.Clear();
    }
}
