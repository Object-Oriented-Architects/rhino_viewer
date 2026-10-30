namespace RhinoViewer;

internal sealed record ObjectDependency(Guid Id, Guid Layer, Guid? Definition, bool IsDefinitionGeometry);

internal sealed record DefinitionDependency(Guid Id, IReadOnlyList<ObjectDependency> Children);

internal sealed record DependencyImpact(Guid[] Objects, HashSet<Guid> Definitions);

internal static class DependencyRules
{
    public static DependencyImpact Resolve(
        IEnumerable<ObjectDependency> top, IEnumerable<DefinitionDependency> definitions,
        ISet<Guid>? layers = null, ISet<Guid>? changedDefinitions = null)
    {
        var affected = new HashSet<Guid>(changedDefinitions ?? new HashSet<Guid>());
        var parents = new Dictionary<Guid, List<Guid>>();
        foreach (var definition in definitions)
        {
            foreach (var child in definition.Children)
            {
                if (layers?.Contains(child.Layer) ?? false)
                    affected.Add(definition.Id);
                if (child.Definition is not Guid nested)
                    continue;

                if (!parents.TryGetValue(nested, out var list))
                {
                    list = new List<Guid>();
                    parents[nested] = list;
                }
                list.Add(definition.Id);
            }
        }

        // 중첩 정의를 역방향으로 따라가 최상위 인스턴스까지 영향을 전파한다.
        var pending = new Queue<Guid>(affected);
        while (pending.TryDequeue(out var child))
        {
            if (!parents.TryGetValue(child, out var list))
                continue;
            foreach (var parent in list)
            {
                if (affected.Add(parent))
                    pending.Enqueue(parent);
            }
        }

        var objects = top.Where(obj => !obj.IsDefinitionGeometry &&
            ((layers?.Contains(obj.Layer) ?? false) ||
             (obj.Definition is Guid definition && affected.Contains(definition))));
        return new(objects.Select(obj => obj.Id).ToArray(), affected);
    }
}
