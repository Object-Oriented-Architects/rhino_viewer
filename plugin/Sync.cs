using System.Drawing;
using Rhino;
using Rhino.Display;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace RhinoViewer;

internal static class SceneSync
{
    public static string? CreateCameraJson(RhinoDoc doc, Point3d center, double scale)
    {
        try
        {
            var view = doc.Views.ActiveView;
            if (view is RhinoPageView page && page.PageIsActive)
                return null;
            var viewport = view?.ActiveViewport;
            if (viewport == null)
                return null;

            using var info = new ViewportInfo(viewport);
            if (!info.GetCameraAngles(out _, out var halfVertical, out var halfHorizontal) ||
                !viewport.GetFrustum(out var left, out var right, out var bottom, out var top, out _, out _))
            {
                return null;
            }

            var position = viewport.CameraLocation;
            var target = viewport.CameraTarget;
            var up = viewport.CameraUp;
            return CameraPayload.CreateJson(
                center.X, center.Y, center.Z, scale, position.X, position.Y, position.Z,
                target.X, target.Y, target.Z, up.X, up.Y, up.Z, halfVertical, halfHorizontal,
                viewport.IsParallelProjection, (top - bottom) / 2, (right - left) / 2);
        }
        catch
        {
            // 잘못된 카메라 때문에 지오메트리 발행·내보내기를 막지 않는다.
            return null;
        }
    }

    public static void PushCamera(RhinoDoc doc, ViewerPanel panel)
    {
        if (!panel.CameraSyncEnabled || !panel.CanSync)
            return;
        var json = CreateCameraJson(doc, panel.ModelCenter, panel.ModelScale);
        if (json != null)
            panel.RunCameraScript(json);
    }

    public static string ToHex(Color color) => $"#{color.R:x2}{color.G:x2}{color.B:x2}";
}

/// <summary>소유권을 넘긴 스냅샷의 Build·Dispose 외에는 모두 Rhino UI 스레드에서 호출한다.</summary>
internal sealed class RhinoSceneDocument : ISceneDocument, IDisposable
{
    private readonly Func<bool> _cameraEnabled;
    private readonly Dictionary<Guid, CachedSource> _sources = new();
    internal RhinoMaterials Materials { get; } = new();

    public RhinoSceneDocument(Func<bool> cameraEnabled)
    {
        _cameraEnabled = cameraEnabled;
    }

    public IEnumerable<Guid> AllIds()
    {
        var doc = RhinoDoc.ActiveDoc;
        if (doc == null)
            return Array.Empty<Guid>();
        return Objects(false).Where(obj => Visible(doc, obj, true)).Select(obj => obj.Id).ToArray();
    }

    internal static List<RhinoObject> Objects(bool selectionOnly)
    {
        var doc = RhinoDoc.ActiveDoc;
        if (doc == null)
            return new();

        // 꺼진 레이어도 의존 관계에 포함해야 다시 켰을 때 dirty가 된다.
        var settings = new ObjectEnumeratorSettings
        {
            NormalObjects = true,
            LockedObjects = true,
            HiddenObjects = true,
            IdefObjects = false,
            DeletedObjects = false
        };
        var all = doc.Objects.GetObjectList(settings)
            .Where(obj => !obj.IsDeleted && !obj.IsInstanceDefinitionGeometry).ToList();
        if (!selectionOnly)
            return all;

        // 숨겨진 선택도 선택이다. 이를 버리고 전체 내보내기로 조용히 전환하면 안 된다.
        var selected = all.Where(obj => obj.IsSelected(false) != 0).ToList();
        return selected.Count > 0 ? selected : all;
    }

    public string MeshSettingsKey()
    {
        var doc = RhinoDoc.ActiveDoc;
        if (doc == null)
            return "";
        using var parameters = doc.GetMeshingParameters(doc.MeshingParameterStyle);
        return ((int)doc.MeshingParameterStyle) + ":" + parameters.ToEncodedString();
    }

    public Presentation Presentation(SceneFrame frame)
    {
        var doc = RhinoDoc.ActiveDoc;
        var background = doc == null ? "#ffffff" : SceneSync.ToHex(doc.RenderSettings.BackgroundColorTop);
        var center = new Point3d(frame.Center.X, frame.Center.Y, frame.Center.Z);
        var camera = doc == null || !_cameraEnabled() ? null : SceneSync.CreateCameraJson(doc, center, frame.Scale);
        return new(background, camera, doc == null ? new Dictionary<Guid, MaterialDescriptor>() : Materials.Table(doc));
    }

    public void Invalidate(Guid? id = null)
    {
        if (id is Guid value)
        {
            if (_sources.Remove(value, out var cached))
                cached.Source.Release();
            return;
        }

        foreach (var cached in _sources.Values)
            cached.Source.Release();
        _sources.Clear();
    }

    public ISceneSnapshot? Capture(Guid id)
    {
        var doc = RhinoDoc.ActiveDoc;
        var obj = doc?.Objects.FindId(id);
        Materials.References.Remove(id);
        if (doc == null || obj == null || obj.IsInstanceDefinitionGeometry || !Visible(doc, obj, true))
            return null;

        var leaves = new List<LeafInstance>();
        var references = new HashSet<Guid>();
        try
        {
            using var parameters = doc.GetMeshingParameters(doc.MeshingParameterStyle);
            Visit(doc, obj, Transform.Identity, null, new(), null, parameters, leaves, references);
            Materials.References.Set(id, references);
            return new RhinoSnapshot(leaves);
        }
        catch
        {
            foreach (var leaf in leaves)
                leaf.Source.Release();
            throw;
        }
    }

    private void Visit(
        RhinoDoc doc, RhinoObject leaf, Transform transform, Guid? parentMaterial,
        HashSet<Guid> stack, Guid? owner, MeshingParameters parameters,
        List<LeafInstance> leaves, HashSet<Guid> references)
    {
        if (!Visible(doc, leaf, false))
            return;
        var materialId = Materials.Resolve(doc, leaf.Attributes, parentMaterial);
        if (leaf is InstanceObject instance)
        {
            var definition = instance.InstanceDefinition;
            if (definition == null || !stack.Add(definition.Id))
                return;
            try
            {
                foreach (var child in definition.GetObjects() ?? Array.Empty<RhinoObject>())
                {
                    Visit(doc, child, transform * instance.InstanceXform, materialId,
                        stack, definition.Id, parameters, leaves, references);
                }
            }
            finally
            {
                stack.Remove(definition.Id);
            }
            return;
        }

        var kind = MaterialRules.Read(materialId, references, id => Materials.Get(doc, id))?.Kind ?? (byte)0;
        LeafSource? source;
        if (owner is Guid definitionId)
        {
            // 공유되는 정의 자식만 캐시한다. 최상위 객체 사본은 스냅샷 종료와 함께 해제한다.
            if (!_sources.TryGetValue(leaf.Id, out var cached))
            {
                source = LeafSource.Capture(leaf, parameters);
                if (source == null)
                    return;
                cached = new(definitionId, source);
                _sources.Add(leaf.Id, cached);
            }
            source = cached.Source;
            source.Retain();
        }
        else
        {
            source = LeafSource.Capture(leaf, parameters);
            if (source == null)
                return;
        }
        leaves.Add(new(source, transform, kind, kind == 0 ? Guid.Empty : materialId));
    }

    private static bool Visible(RhinoDoc doc, RhinoObject obj, bool top)
    {
        if (obj.IsDeleted || obj.IsHidden || (top && !obj.Visible))
            return false;
        var layer = doc.Layers[obj.Attributes.LayerIndex];
        var seen = new HashSet<Guid>();
        while (layer != null)
        {
            if (layer.IsDeleted || !layer.IsVisible || !seen.Add(layer.Id))
                return false;
            if (layer.ParentLayerId == Guid.Empty)
                return true;
            layer = doc.Layers.FindId(layer.ParentLayerId);
        }
        return false;
    }

    public IEnumerable<Guid> Affected(ISet<Guid> changedLayers, ISet<Guid> changedDefinitions)
    {
        var doc = RhinoDoc.ActiveDoc;
        if (doc == null)
            return Array.Empty<Guid>();

        ObjectDependency Describe(RhinoObject obj) => new(
            obj.Id, doc.Layers[obj.Attributes.LayerIndex].Id,
            (obj as InstanceObject)?.InstanceDefinition?.Id, obj.IsInstanceDefinitionGeometry);

        var children = new Dictionary<Guid, List<Guid>>();
        foreach (var layer in doc.Layers)
        {
            if (!children.TryGetValue(layer.ParentLayerId, out var list))
            {
                list = new();
                children[layer.ParentLayerId] = list;
            }
            list.Add(layer.Id);
        }
        var layers = new HashSet<Guid>(changedLayers);
        var pending = new Queue<Guid>(layers);
        while (pending.TryDequeue(out var parent))
        {
            if (!children.TryGetValue(parent, out var list))
                continue;
            foreach (var child in list)
            {
                if (layers.Add(child))
                    pending.Enqueue(child);
            }
        }

        var definitions = doc.InstanceDefinitions.Where(definition => !definition.IsDeleted)
            .Select(definition => new DefinitionDependency(definition.Id,
                (definition.GetObjects() ?? Array.Empty<RhinoObject>()).Select(Describe).ToArray())).ToArray();
        var impact = DependencyRules.Resolve(Objects(false).Select(Describe), definitions, layers, changedDefinitions);
        if (changedDefinitions.Count > 0)
        {
            // 바뀐 정의와 그 상위 정의의 리프만 무효화하고 무관한 정의의 메시를 유지한다.
            var geometryImpact = DependencyRules.Resolve(Array.Empty<ObjectDependency>(), definitions,
                changedDefinitions: changedDefinitions);
            foreach (var id in _sources.Where(pair => geometryImpact.Definitions.Contains(pair.Value.Definition))
                .Select(pair => pair.Key).ToArray())
            {
                Invalidate(id);
            }
        }
        return impact.Objects;
    }

    public void Dispose()
    {
        Invalidate();
        Materials.Clear();
    }

    private sealed record LeafInstance(LeafSource Source, Transform Transform, byte Kind, Guid MaterialId);
    private sealed record CachedSource(Guid Definition, LeafSource Source);

    /// <summary>
    /// 정의 자식은 한 번 메시화한 뒤 인스턴스별로 사본·변환한다.
    /// UI 무효화는 캐시의 참조만 해제하고, 진행 중인 백그라운드 참조는 빌드 종료까지 사본을 보호한다.
    /// </summary>
    private sealed class LeafSource
    {
        private readonly object _gate = new();
        private int _references = 1;
        private GeometryBase? _geometry;
        private Mesh[] _render = Array.Empty<Mesh>();
        private MeshingParameters? _parameters;
        private Mesh? _mesh;
        private bool _built;

        public static LeafSource? Capture(RhinoObject obj, MeshingParameters parameters)
        {
            var geometry = obj.Geometry;
            if (geometry is not (Mesh or Brep or Extrusion or SubD))
                return null;

            var source = new LeafSource();
            try
            {
                if (geometry is Mesh mesh)
                {
                    source._mesh = mesh.DuplicateMesh();
                    source._built = true;
                    return source;
                }

                var copies = new List<Mesh>();
                try
                {
                    foreach (var render in obj.GetMeshes(MeshType.Render) ?? Array.Empty<Mesh>())
                    {
                        if (render.Vertices.Count > 0 && render.Faces.Count > 0)
                            copies.Add(render.DuplicateMesh());
                    }
                    source._render = copies.ToArray();
                }
                catch
                {
                    foreach (var copy in copies)
                        copy.Dispose();
                    throw;
                }

                // 렌더 메시가 있으면 원본 Brep 사본은 쓰지 않는다. 미지원 타입도 위에서 즉시 제외한다.
                if (source._render.Length == 0)
                {
                    source._geometry = geometry.Duplicate();
                    source._parameters = new MeshingParameters();
                    source._parameters.CopyFrom(parameters);
                }
                return source;
            }
            catch
            {
                source.Release();
                throw;
            }
        }

        public void Retain() => Interlocked.Increment(ref _references);

        public void Release()
        {
            if (Interlocked.Decrement(ref _references) != 0)
                return;
            ReleaseInputs();
            _mesh?.Dispose();
        }

        private void ReleaseInputs()
        {
            _geometry?.Dispose();
            _geometry = null;
            _parameters?.Dispose();
            _parameters = null;
            foreach (var mesh in _render)
                mesh.Dispose();
            _render = Array.Empty<Mesh>();
        }

        public Mesh? CopyMesh()
        {
            lock (_gate)
            {
                if (!_built)
                {
                    try
                    {
                        _mesh = Join(_render);
                        if (_mesh == null && _parameters != null)
                            _mesh = CreateMesh(_geometry, _parameters);
                        _built = true;
                    }
                    finally
                    {
                        // 이제 백그라운드가 입력 사본을 해제하고, 정의 캐시에는 완성 메시만 남긴다.
                        ReleaseInputs();
                    }
                }
                return _mesh?.DuplicateMesh();
            }
        }

        private static Mesh? CreateMesh(GeometryBase? geometry, MeshingParameters parameters)
        {
            switch (geometry)
            {
                case Brep brep:
                    return FromBrep(brep, parameters);
                case Extrusion extrusion:
                    using (var brep = extrusion.ToBrep(true))
                        return brep == null ? null : FromBrep(brep, parameters);
                case SubD subd:
                    using (var display = parameters.SubDDisplayParameters())
                        return Mesh.CreateFromSubD(subd, (int)display.DisplayDensity(subd));
                default:
                    return null;
            }
        }

        private static Mesh? FromBrep(Brep brep, MeshingParameters parameters)
        {
            var pieces = Mesh.CreateFromBrep(brep, parameters);
            try
            {
                return Join(pieces);
            }
            finally
            {
                if (pieces != null)
                {
                    foreach (var piece in pieces)
                        piece.Dispose();
                }
            }
        }

        private static Mesh? Join(IEnumerable<Mesh>? meshes)
        {
            var result = new Mesh();
            foreach (var mesh in meshes ?? Array.Empty<Mesh>())
            {
                if (mesh.Vertices.Count > 0 && mesh.Faces.Count > 0)
                    result.Append(mesh);
            }
            if (result.Vertices.Count > 0 && result.Faces.Count > 0)
                return result;
            result.Dispose();
            return null;
        }
    }

    private sealed class RhinoSnapshot : ISceneSnapshot
    {
        private readonly List<LeafInstance> _leaves;

        public RhinoSnapshot(List<LeafInstance> leaves)
        {
            _leaves = leaves;
        }

        public BuiltObject? Build()
        {
            var meshes = new List<(Mesh Mesh, byte Kind, Guid MaterialId)>();
            try
            {
                var bounds = BoundingBox.Unset;
                foreach (var leaf in _leaves)
                {
                    var mesh = leaf.Source.CopyMesh();
                    if (mesh == null)
                        continue;
                    if (!mesh.Transform(leaf.Transform) || mesh.Vertices.Count == 0 || mesh.Faces.Count == 0)
                    {
                        mesh.Dispose();
                        continue;
                    }
                    meshes.Add((mesh, leaf.Kind, leaf.MaterialId));
                    bounds.Union(mesh.GetBoundingBox(true));
                }
                if (meshes.Count == 0 || !bounds.IsValid)
                    return null;

                var origin = bounds.Center;
                // 보석은 리프당 한 part를 유지한다. 맞닿은 별개 스톤을 하나로 합치면 안 된다.
                var parts = meshes.Select(item => CreatePart(item.Mesh, item.Kind, item.MaterialId, origin)).ToArray();
                return new(MeshPayload.Write(new(new(origin.X, origin.Y, origin.Z), parts)),
                    new(new(bounds.Min.X, bounds.Min.Y, bounds.Min.Z), new(bounds.Max.X, bounds.Max.Y, bounds.Max.Z)));
            }
            finally
            {
                foreach (var mesh in meshes)
                    mesh.Mesh.Dispose();
            }
        }

        private static MeshPart CreatePart(Mesh mesh, byte kind, Guid materialId, Point3d origin)
        {
            var positions = new float[mesh.Vertices.Count * 3];
            var normals = new float[positions.Length];
            var indices = new List<uint>();
            var completeNormals = mesh.Normals.Count == mesh.Vertices.Count;
            for (int index = 0; index < mesh.Vertices.Count; index++)
            {
                var vertex = mesh.Vertices.Point3dAt(index);
                positions[index * 3] = (float)(vertex.X - origin.X);
                positions[index * 3 + 1] = (float)(vertex.Y - origin.Y);
                positions[index * 3 + 2] = (float)(vertex.Z - origin.Z);
                if (mesh.Normals.Count != mesh.Vertices.Count)
                    continue;

                var normal = mesh.Normals[index];
                var length = Math.Sqrt((double)normal.X * normal.X + (double)normal.Y * normal.Y + (double)normal.Z * normal.Z);
                if (length <= 1e-12 || !double.IsFinite(length))
                {
                    completeNormals = false;
                    continue;
                }
                normals[index * 3] = (float)(normal.X / length);
                normals[index * 3 + 1] = (float)(normal.Y / length);
                normals[index * 3 + 2] = (float)(normal.Z / length);
            }
            // 페이지는 전부 0일 때만 재계산한다. 일부만 잘못된 경우도 전체 재계산을 요청한다.
            if (!completeNormals)
                Array.Clear(normals);

            foreach (var face in mesh.Faces)
            {
                indices.Add((uint)face.A);
                indices.Add((uint)face.B);
                indices.Add((uint)face.C);
                if (face.IsQuad)
                {
                    indices.Add((uint)face.A);
                    indices.Add((uint)face.C);
                    indices.Add((uint)face.D);
                }
            }
            return new(kind, materialId, positions, normals, indices.ToArray());
        }

        public void Dispose()
        {
            foreach (var leaf in _leaves)
                leaf.Source.Release();
            _leaves.Clear();
        }
    }
}
