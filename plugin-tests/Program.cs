using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using RhinoViewer;

internal static partial class Program
{
    private static int _passed;
    private static int _failed;
    private static readonly string Root = FindRoot();
    private static readonly string Temp = Path.Combine(Root, "temp", "plugin-tests");

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !Directory.Exists(Path.Combine(directory.FullName, "plugin")))
        {
            directory = directory.Parent;
        }
        return directory!.FullName;
    }

    private static async Task<int> Main()
    {
        Directory.CreateDirectory(Temp);
        var tests = new (string Name, Func<Task> Run)[]
        {
            ("RVM2 독립 golden·디코드", () => Sync(Golden)),
            ("RVS1 오프셋·정렬·HTML base64·EXE trailer", () => Sync(Container)),
            ("200MiB 스트리밍 메모리 한도", () => Sync(MemoryBudget)),
            ("1000개 중 1개 증분·전체 재동기화", () => Sync(Incremental)),
            ("같은 메시 재빌드 rev 유지·kind 변경 rev 증가", () => Sync(StableRevision)),
            ("진행 중 dirty·delete·문서 전환", () => Sync(Races)),
            ("Replace Delete→Add가 사이클과 겹쳐도 매니페스트 유지", () => Sync(ReplaceRace)),
            ("숨김 dirty·메타데이터 전용·생성 한 번", () => Sync(Hidden)),
            ("커밋 시점 표현·사본 Dispose", () => Sync(CommitPresentation)),
            ("중첩 정의·레이어 의존·정의 지오메트리 제외", () => Sync(Dependencies)),
            ("테이블 이벤트 배치·중복 제거", () => Sync(DependencyBatch)),
            ("Import·Paste형 Merge 이벤트는 추가 객체만 dirty", () => Sync(ImportSequence)),
            ("재질 source·인덱스·중첩 상속", () => Sync(MaterialResolution)),
            ("실패 참조·추가·삭제·교체 영향", () => Sync(MaterialImpact)),
            ("재질 이벤트 값 비교·최상위·Ignore 판정", () => Sync(MaterialEvents)),
            ("재질 kind 변화·값 정규화", () => Sync(MaterialValues)),
            ("재질 표만 변경할 때 메시·rev 유지", () => Sync(MaterialMetadata)),
            ("C#→JS GUID·RVM2·재질 검증", () => Sync(WebProtocol)),
            ("pull 실행 중 새 신호·재시도·페이지 전환", () => Sync(PullRace)),
            ("C1 정확한 스크립트·카메라 직렬화", () => Sync(Camera)),
            ("서버 경로·보관·보안·인코딩", Server),
            ("새 rev 발행과 1000 HTTP state+object 동시 요청", Concurrency)
        };
        foreach (var (name, run) in tests)
        {
            await Test(name, run);
        }
        Console.WriteLine($"test result: {(_failed == 0 ? "ok" : "FAILED")}. {_passed} passed; {_failed} failed");
        return _failed == 0 ? 0 : 1;
    }

    private static Task Sync(Action action)
    {
        action();
        return Task.CompletedTask;
    }

    private static void Check(bool condition, string message = "검사 실패")
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static void Equal<T>(T expected, T actual)
    {
        Check(EqualityComparer<T>.Default.Equals(expected, actual), $"기댓값 {expected}, 실제 {actual}");
    }

    private static void Bytes(byte[] expected, byte[] actual)
    {
        Check(expected.SequenceEqual(actual), "바이트 불일치");
    }

    private static async Task Test(string name, Func<Task> test)
    {
        try
        {
            await test();
            _passed++;
            Console.WriteLine("PASS " + name);
        }
        catch (Exception ex)
        {
            _failed++;
            Console.WriteLine("FAIL " + name + " Exception " + ex);
        }
    }

    private static MeshObject Small(double offset = 0, byte kind = 0) => new(new(10 + offset, 20, 30), new[]
    {
        new MeshPart(kind, kind == 0 ? Guid.Empty : TestMaterial,
            new float[]
            {
                0, 0, 0,
                1, 0, 0,
                0, 1, 0
            },
            new float[]
            {
                0, 0, 1,
                0, 0, 1,
                0, 0, 1
            },
            new uint[] { 0, 1, 2 }),
        new MeshPart(2, TestMaterial,
            new float[]
            {
                0, 0, 1,
                1, 0, 1,
                0, 1, 1
            },
            new float[]
            {
                0, 0, 1,
                0, 0, 1,
                0, 0, 1
            },
            new uint[] { 0, 1, 2 })
    });

    private static byte[] Gunzip(byte[] bytes)
    {
        using var input = new MemoryStream(bytes);
        using var zip = new GZipStream(input, CompressionMode.Decompress);
        using var output = new MemoryStream();
        zip.CopyTo(output);
        return output.ToArray();
    }

    private static SceneObject Object(int seed = 0, long rev = 1)
    {
        var idBytes = new byte[16];
        BinaryPrimitives.WriteInt32LittleEndian(idBytes, seed + 1);
        var small = Small();
        return new(new Guid(idBytes), rev, MeshPayload.Write(small), MeshPayloadReader.Bounds(small));
    }

    private static BuiltObject Built(double offset = 0, byte kind = 0)
    {
        var small = Small(offset, kind);
        return new(MeshPayload.Write(small), MeshPayloadReader.Bounds(small));
    }

    /// <summary>
    /// C6 바이트 규약은 인코더·디코더 왕복만으로 검증하면 같은 오류를 놓칠 수 있다.
    /// 직접 조립한 바이트로 kind·원점·배열 순서와 빈 part 제외를 고정한다.
    /// </summary>
    private static void Golden()
    {
        // 직렬화 대상 구현으로 만들지 않은 고정 little-endian 바이트를 기준으로 삼는다.
        const string header = "52564D32 02000000 0000000000002440 0000000000003440 0000000000003E40";
        const string normal = "00000000 00000000 0000803F 00000000 00000000 0000803F 00000000 00000000 0000803F";
        const string indices = "00000000 01000000 02000000";
        const string first = "00000000 00000000000000000000000000000000 03000000 03000000 " +
            "00000000 00000000 00000000 0000803F 00000000 00000000 00000000 0000803F 00000000";
        const string second = "02000000 33221100554477668899AABBCCDDEEFF 03000000 03000000 " +
            "00000000 00000000 0000803F 0000803F 00000000 0000803F 00000000 0000803F 0000803F";
        var expected = Convert.FromHexString(
            string.Join(" ", header, first, normal, indices, second, normal, indices).Replace(" ", ""));
        var payload = MeshPayload.Write(Small());
        Bytes(expected, Gunzip(payload));
        var decoded = MeshPayloadReader.Read(payload);
        Equal(Small().Origin, decoded.Origin);
        Equal(2, decoded.Parts.Count);
        for (int index = 0; index < 2; index++)
        {
            var original = Small().Parts[index];
            var actual = decoded.Parts[index];
            Equal(original.Kind, actual.Kind);
            Equal(original.MaterialId, actual.MaterialId);
            Check(original.Positions.SequenceEqual(actual.Positions));
            Check(original.Normals.SequenceEqual(actual.Normals));
            Check(original.Indices.SequenceEqual(actual.Indices));
        }
        Bytes(expected, Gunzip(MeshPayload.Write(decoded)));
        var empty = new MeshPart(0, Guid.Empty, Array.Empty<float>(), Array.Empty<float>(), Array.Empty<uint>());
        Equal(0, MeshPayloadReader.Read(MeshPayload.Write(new(new(0, 0, 0), new[] { empty }))).Parts.Count);
    }

    /// <summary>
    /// C3 컨테이너 데이터 오프셋은 헤더가 아닌 정렬된 데이터 영역 시작 기준이다.
    /// HTML 주입·base64·EXE trailer를 하나의 같은 RVS 바이트와 대조한다.
    /// </summary>
    private static void Container()
    {
        foreach (var count in new[] { 1, 3 })
        {
            var objects = Enumerable.Range(0, count).Select(index => Object(index)).ToArray();
            var frame = SceneFrame.Calculate(objects.Select(obj => obj.Box));
            var presentation = new Presentation("#abcdef", "{\"parallel\":true}", TestMaterials());
            using var rvs = new MemoryStream();
            SceneExport.WriteRvs(rvs, objects, frame, presentation);
            var bytes = rvs.ToArray();
            Equal("RVS1", Encoding.ASCII.GetString(bytes, 0, 4));
            var length = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4));
            var data = (8 + (int)length + 3) & ~3;
            Equal(0, data % 4);
            for (int index = 8 + (int)length; index < data; index++)
            {
                Equal((byte)0, bytes[index]);
            }

            using var json = JsonDocument.Parse(bytes.AsMemory(8, (int)length));
            var root = json.RootElement;
            Equal(frame.Scale, root.GetProperty("scale").GetDouble());
            Equal(frame.Center.X, root.GetProperty("center")[0].GetDouble());
            Equal("#abcdef", root.GetProperty("background").GetString());
            Check(root.GetProperty("camera").GetProperty("parallel").GetBoolean());
            Equal(2, root.GetProperty("materials").GetProperty(TestMaterial.ToString("D")).GetProperty("kind").GetInt32());
            long offset = 0;
            for (int index = 0; index < count; index++)
            {
                var entry = root.GetProperty("objects")[index];
                Equal(objects[index].Id.ToString("D"), entry.GetProperty("id").GetString());
                Equal(offset, entry.GetProperty("offset").GetInt64());
                Equal(objects[index].Payload.Length, entry.GetProperty("length").GetInt32());
                Bytes(objects[index].Payload, bytes.AsSpan(data + (int)offset, objects[index].Payload.Length).ToArray());
                offset += objects[index].Payload.Length;
            }
            Equal(data + offset, bytes.LongLength);

            const string shell = "<!doctype html><head>한글</head><body>ß</body>";
            using var html = new MemoryStream();
            SceneExport.WriteHtml(html, shell, objects, frame, presentation);
            var text = Encoding.UTF8.GetString(html.ToArray());
            const string marker = "<script>window.__SCENE_RVS=\"";
            var start = text.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
            var end = text.IndexOf("\";</script>", start, StringComparison.Ordinal);
            Bytes(bytes, Convert.FromBase64String(text[start..end]));
            Check(text.IndexOf(marker, StringComparison.Ordinal) < text.IndexOf("</head>", StringComparison.Ordinal));
            var template = Path.Combine(Temp, "template.exe");
            var executable = Path.Combine(Temp, "scene.exe");
            File.WriteAllBytes(template, new byte[] { 1, 2, 3, 4, 5 });
            ExecutablePayload.Write(template, executable,
                output => SceneExport.WriteHtml(output, shell, objects, frame, presentation));
            var packed = File.ReadAllBytes(executable);
            Equal(html.Length, BinaryPrimitives.ReadInt64LittleEndian(packed.AsSpan(packed.Length - 16)));
            Equal("RVHTML01", Encoding.ASCII.GetString(packed, packed.Length - 8, 8));
            Bytes(html.ToArray(), packed.AsSpan(5, packed.Length - 21).ToArray());
        }
    }

    /// <summary>
    /// 200MiB 입력에서 전체 base64·완성 HTML 사본을 만들면 메모리 한도를 넘는다.
    /// 모든 메모리 페이지를 상주시킨 뒤 실제 파일에 스트리밍하여 최고 사용량을 측정한다.
    /// </summary>
    private static void MemoryBudget()
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        using var process = Process.GetCurrentProcess();
        process.Refresh();
        var before = process.PeakWorkingSet64;
        const long size = 200L * 1024 * 1024;
        var objects = Enumerable.Range(0, 10).Select(index => new SceneObject(Guid.NewGuid(), 1,
            new byte[20 * 1024 * 1024], new(new(0, 0, 0), new(1, 1, 1)))).ToArray();
        // 모든 페이지를 실제로 만져 demand-zero 대신 상주 페이로드의 메모리를 측정한다.
        foreach (var obj in objects)
        {
            for (int index = 0; index < obj.Payload.Length; index += 4096)
            {
                obj.Payload[index] = 17;
            }
        }

        var path = Path.Combine(Temp, "large.html");
        using (var stream = File.Create(path))
        {
            SceneExport.WriteHtml(stream, "<head></head>", objects, new(new(0, 0, 0), 1), new("#ffffff", null, new Dictionary<Guid, MaterialDescriptor>()));
        }
        process.Refresh();
        var increase = process.PeakWorkingSet64 - before;
        Console.WriteLine($"PASS memory evidence payloadBytes={size} peakIncrease={increase} limit={3 * size}");
        Check(increase < 3 * size, "스트리밍 메모리 한도 초과");
        File.Delete(path);
        GC.KeepAlive(objects);
    }

    private sealed class Dispatcher : ISceneDispatcher
    {
        private readonly ConcurrentQueue<Action> _queue = new();

        public void Post(Action action)
        {
            _queue.Enqueue(action);
        }

        public void Pump()
        {
            while (_queue.TryDequeue(out var action))
            {
                action();
            }
        }

        public void Until(Func<bool> done)
        {
            var watch = Stopwatch.StartNew();
            while (!done())
            {
                Pump();
                if (watch.Elapsed.TotalSeconds > 20)
                {
                    throw new TimeoutException();
                }
                Thread.Sleep(1);
            }
            Pump();
        }
    }

    private sealed class Fake : ISceneDocument
    {
        public readonly Dictionary<Guid, BuiltObject> Objects = new();
        public int Calls;
        public int Active;
        public int MaxActive;
        public int PresentationCalls;
        public int Disposed;
        public string Background = "#ffffff";
        public Dictionary<Guid, MaterialDescriptor> Materials = new();
        public ManualResetEventSlim? Enter;
        public ManualResetEventSlim? Release;

        public ISceneSnapshot? Capture(Guid id)
        {
            return Objects.TryGetValue(id, out var value) ? new Snapshot(this, value) : null;
        }

        public Presentation Presentation(SceneFrame frame)
        {
            PresentationCalls++;
            return new(Background, null, Materials);
        }

        private sealed class Snapshot : ISceneSnapshot
        {
            private readonly Fake _fake;
            private readonly BuiltObject _built;

            public Snapshot(Fake fake, BuiltObject built)
            {
                _fake = fake;
                _built = built;
            }

            public BuiltObject Build()
            {
                Interlocked.Increment(ref _fake.Calls);
                var active = Interlocked.Increment(ref _fake.Active);
                _fake.MaxActive = Math.Max(active, _fake.MaxActive);
                _fake.Enter?.Set();
                if (_fake.Release != null && !_fake.Release.Wait(TimeSpan.FromSeconds(15)))
                {
                    throw new TimeoutException("가짜 메시 빌드 대기 초과");
                }
                Interlocked.Decrement(ref _fake.Active);
                return _built;
            }

            public void Dispose()
            {
                Interlocked.Increment(ref _fake.Disposed);
            }
        }
    }

    private static (Fake Fake, Dispatcher Ui, IncrementalScene Engine, MemoryLiveStore Store) Setup(int count)
    {
        var fake = new Fake();
        foreach (var obj in Enumerable.Range(0, count).Select(index => Object(index)))
        {
            fake.Objects[obj.Id] = new(obj.Payload, obj.Box);
        }
        var ui = new Dispatcher();
        var store = new MemoryLiveStore();
        var engine = new IncrementalScene(fake, ui, store);
        engine.Failed += error => throw error;
        engine.Reset(fake.Objects.Keys);
        engine.Start();
        ui.Until(() => !engine.Running);
        return (fake, ui, engine, store);
    }

    private static byte[] Get(MemoryLiveStore store)
    {
        Check(store.TryGet("/live/state.json", out var bytes));
        return bytes;
    }

    // 제품 캐시 접근자를 노출하지 않고 실제 공개된 매니페스트만 검사한다.
    private static Dictionary<Guid, long> Revisions(MemoryLiveStore store)
    {
        using var document = JsonDocument.Parse(Get(store));
        return document.RootElement.GetProperty("objects").EnumerateArray().ToDictionary(
            obj => obj.GetProperty("id").GetGuid(), obj => obj.GetProperty("rev").GetInt64());
    }

    /// <summary>
    /// 한 객체 변경이 나머지 999개 객체의 rev나 메시화를 건드리면 안 된다.
    /// 삭제 후 재추가와 수동 전체 리셋은 전역 rev가 재사용되지 않아야 한다.
    /// </summary>
    private static void Incremental()
    {
        var (fake, ui, engine, store) = Setup(1000);
        Equal(1000, fake.Calls);
        var before = Revisions(store);
        var id = fake.Objects.Keys.First();
        fake.Objects[id] = Built(1);
        fake.Calls = 0;
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(1, fake.Calls);
        var after = Revisions(store);
        Check(after[id] > before[id]);
        foreach (var other in before.Keys.Where(key => key != id))
        {
            Equal(before[other], after[other]);
        }

        var revision = after[id];
        engine.Delete(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Check(!Revisions(store).ContainsKey(id));
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Check(Revisions(store)[id] > revision, "같은 id 재추가에서 rev 반복");

        fake.Objects[id] = new(Object().Payload, new(new(-10, -20, -30), new(20, 40, 60)));
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        using var document = JsonDocument.Parse(Get(store));
        Equal(1.5 / 90, document.RootElement.GetProperty("scale").GetDouble());
        Equal(15.0, document.RootElement.GetProperty("center")[2].GetDouble());
        Equal(1, fake.MaxActive);
        Equal(1.5 / 1e-10, SceneFrame.Calculate(new[] { new WorldBox(new(0, 0, 0), new(1e-10, 0, 0)) }).Scale);
        var beforeReset = Revisions(store)[id];
        engine.Reset(fake.Objects.Keys);
        engine.Start();
        ui.Until(() => !engine.Running);
        Check(Revisions(store)[id] > beforeReset, "문서 리셋에서 rev 재사용");
    }

    /// <summary>
    /// 색·잠금처럼 메시가 같게 재빌드되는 편집은 브라우저 BVH를 다시 만들 이유가 없다.
    /// 압축 헤더 시간 의존성을 배제하고, 같은 지오메트리라도 kind 변경은 새 rev로 구별한다.
    /// </summary>
    private static void StableRevision()
    {
        var (fake, ui, engine, store) = Setup(1);
        var id = fake.Objects.Keys.Single();
        var before = Revisions(store)[id];
        var payload = fake.Objects[id].Payload;
        // gzip 헤더에 현재 시각이 들어가도 이 시험이 잡도록 초 경계를 넘긴다.
        Thread.Sleep(1100);
        fake.Objects[id] = Built();
        Bytes(payload, fake.Objects[id].Payload);
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(before, Revisions(store)[id]);
        Equal(2, fake.Calls);

        fake.Objects[id] = Built(kind: 1);
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Check(Revisions(store)[id] > before, "kind 변경을 놓침");
        before = Revisions(store)[id];
        var changed = Small(kind: 1);
        changed = changed with
        {
            Parts = changed.Parts.Select(part => part with { MaterialId = Guid.NewGuid() }).ToArray()
        };
        fake.Objects[id] = new(MeshPayload.Write(changed), MeshPayloadReader.Bounds(changed));
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        Check(Revisions(store)[id] > before, "재질 id만 바뀐 지정을 놓침");
    }

    /// <summary>
    /// 백그라운드 빌드를 멈춘 사이 dirty·삭제·문서 전환을 UI에서 차례로 주입한다.
    /// 객체 세대와 문서 세대 모두 확인하며 동시 빌드가 하나를 넘지 않는지 검사한다.
    /// </summary>
    private static void Races()
    {
        var (fake, ui, engine, store) = Setup(1);
        var id = fake.Objects.Keys.Single();
        var old = Revisions(store)[id];
        using var entered = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        fake.Enter = entered;
        fake.Release = release;
        fake.Calls = 0;
        var published = new List<long>();
        engine.Published += _ => published.Add(Revisions(store).GetValueOrDefault(id));
        engine.Dirty(id);
        engine.Start();
        Check(entered.Wait(10000));
        fake.Objects[id] = Built(1);
        engine.Dirty(id);
        engine.Start();
        Equal(1, fake.Active);
        release.Set();
        ui.Until(() => !engine.Running);
        Equal(2, fake.Calls);
        Equal(old, published[0]);
        Check(published[^1] > old);
        Equal(1, fake.MaxActive);

        entered.Reset();
        release.Reset();
        published.Clear();
        engine.Dirty(id);
        engine.Start();
        Check(entered.Wait(10000));
        engine.Delete(id);
        release.Set();
        ui.Until(() => !engine.Running);
        Check(!Revisions(store).ContainsKey(id), "삭제한 객체가 되살아남");
        Check(published.All(revision => revision == 0));

        // id가 같아도 다른 문서 세대의 작업은 커밋하면 안 된다.
        engine.Dirty(id);
        engine.Start();
        ui.Until(() => !engine.Running);
        entered.Reset();
        release.Reset();
        engine.Dirty(id);
        engine.Start();
        Check(entered.Wait(10000));
        engine.Reset(Array.Empty<Guid>());
        release.Set();
        ui.Until(() => !engine.Running);
        Equal(0, Revisions(store).Count);
    }

    /// <summary>
    /// Replace와 Undo의 Delete 다음 Add가 다른 객체의 빌드와 겹치는 순서를 만든다.
    /// 최종 화면뿐 아니라 중간에 발행된 모든 매니페스트에 대상 객체가 남아 있어야 한다.
    /// </summary>
    private static void ReplaceRace()
    {
        var (fake, ui, engine, store) = Setup(2);
        var ids = fake.Objects.Keys.ToArray();
        var old = Revisions(store)[ids[1]];
        using var entered = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        fake.Enter = entered;
        fake.Release = release;
        var published = new List<Dictionary<Guid, long>>();
        engine.Published += _ => published.Add(Revisions(store));
        engine.Dirty(ids[0]);
        engine.Start();
        Check(entered.Wait(10000));
        // 다른 객체 빌드 중 Replace의 Delete→Add 또는 Undo의 Delete→Undelete를 재현한다.
        engine.Delete(ids[1]);
        fake.Objects[ids[1]] = Built(2);
        engine.Dirty(ids[1]);
        release.Set();
        ui.Until(() => !engine.Running);
        Check(published.Count >= 2);
        Check(published.All(manifest => manifest.ContainsKey(ids[1])), "Replace 중 매니페스트에서 객체가 사라짐");
        Equal(old, published[0][ids[1]]);
        Check(published[^1][ids[1]] > old);
    }

    /// <summary>
    /// 숨긴 패널의 dirty는 누적하지만 메시화하지 않으며 표시할 때 한 번 처리한다.
    /// 생성 후 깨끗한 재시작과 메타데이터 변경도 불필요한 메시화를 만들면 안 된다.
    /// </summary>
    private static void Hidden()
    {
        var (fake, ui, engine, store) = Setup(1);
        Equal(1, fake.PresentationCalls);
        engine.Start();
        ui.Pump();
        Equal(1, fake.PresentationCalls);
        engine.Visible = false;
        var id = fake.Objects.Keys.Single();
        engine.Dirty(id);
        engine.Start();
        Equal(1, fake.Calls);
        Check(engine.HasPending);
        engine.Visible = true;
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(2, fake.Calls);
        var revision = Revisions(store)[id];
        engine.MetadataDirty();
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(2, fake.Calls);
        Equal(revision, Revisions(store)[id]);
    }

    /// <summary>
    /// 빌드 중 배경색을 바꿔 캡처 시점의 표현 정보가 늦게 덮어쓰지 않는지 본다.
    /// 공개된 배경색이 커밋 시점 값인지, 빌드 사본을 빠짐없이 해제했는지 검사한다.
    /// </summary>
    private static void CommitPresentation()
    {
        var (fake, ui, engine, store) = Setup(1);
        using var entered = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        fake.Enter = entered;
        fake.Release = release;
        engine.Dirty(fake.Objects.Keys.Single());
        engine.Start();
        Check(entered.Wait(10000));
        fake.Background = "#123456";
        release.Set();
        ui.Until(() => !engine.Running);
        using var manifest = JsonDocument.Parse(Get(store));
        Equal("#123456", manifest.RootElement.GetProperty("background").GetString());
        Equal(fake.Calls, fake.Disposed);
    }

    /// <summary>
    /// 레이어에 자식을 둔 정의에서 중첩 상위 정의와 최상위 인스턴스로 영향을 전파한다.
    /// 무관한 정의를 제외하고 정의 내부 지오메트리를 독립 라이브 객체로 올리지 않는다.
    /// </summary>
    private static void Dependencies()
    {
        var layer = Guid.NewGuid();
        var child = Guid.NewGuid();
        var parent = Guid.NewGuid();
        var instance = Guid.NewGuid();
        var definitionChild = Guid.NewGuid();
        var unrelated = Guid.NewGuid();
        var definitions = new[]
        {
            new DefinitionDependency(child, new[] { new ObjectDependency(definitionChild, layer, null, true) }),
            new DefinitionDependency(parent, new[] { new ObjectDependency(Guid.NewGuid(), Guid.NewGuid(), child, true) }),
            new DefinitionDependency(unrelated, Array.Empty<ObjectDependency>())
        };
        var top = new[]
        {
            new ObjectDependency(instance, Guid.NewGuid(), parent, false),
            new ObjectDependency(definitionChild, layer, null, true)
        };
        var byLayer = DependencyRules.Resolve(top, definitions, new HashSet<Guid> { layer });
        Check(byLayer.Objects.SequenceEqual(new[] { instance }));
        var byDefinition = DependencyRules.Resolve(top, definitions, changedDefinitions: new HashSet<Guid> { child });
        Check(byDefinition.Objects.SequenceEqual(new[] { instance }));
        Check(byDefinition.Definitions.SetEquals(new[] { child, parent }));
        Check(!byDefinition.Definitions.Contains(unrelated));
        var (fake, ui, engine, _) = Setup(1);
        var calls = fake.Calls;
        engine.Dirty(definitionChild, true);
        engine.Start();
        ui.Pump();
        Equal(calls, fake.Calls);
        Check(!engine.HasPending);
    }

    /// <summary>
    /// 테이블 이벤트 500개가 같은 대상을 가리켜도 이벤트 중에는 의존 계산을 하지 않는다.
    /// Preparing에서 한 번만 해석하고 영향을 받은 최상위 객체만 다시 캡처한다.
    /// </summary>
    private static void DependencyBatch()
    {
        var (fake, ui, engine, store) = Setup(2);
        var changed = new HashSet<Guid>();
        var id = fake.Objects.Keys.First();
        var resolutions = 0;
        engine.Preparing += () =>
        {
            if (changed.Count == 0)
            {
                return;
            }
            resolutions++;
            engine.Dirty(id);
            changed.Clear();
        };
        for (int index = 0; index < 500; index++)
        {
            changed.Add(id);
            engine.MetadataDirty();
        }
        Equal(0, resolutions);
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(1, resolutions);
        Equal(3, fake.Calls);

        // 빌드 중 들어온 테이블 변경도 커밋 전에 해석해야 그 빌드 결과가 오래되었음을 알 수 있다.
        // 첫 발행은 기존 rev를 유지하고, 다음 사이클에서 새 지오메트리를 발행해야 한다.
        using var entered = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        fake.Enter = entered;
        fake.Release = release;
        var previous = Revisions(store)[id];
        var published = new List<long>();
        engine.Published += _ =>
        {
            published.Add(Revisions(store)[id]);
        };
        engine.Dirty(id);
        engine.Start();
        Check(entered.Wait(10000));
        fake.Objects[id] = Built(2);
        changed.Add(id);
        engine.MetadataDirty();
        release.Set();
        ui.Until(() => !engine.Running);
        Equal(2, resolutions);
        Equal(previous, published[0]);
        Check(published[^1] > previous);
        Equal(5, fake.Calls);
    }

    /// <summary>
    /// Rhino 없이 Add 다음 EndOpen(Merge)이 오는 이벤트 순서를 재현한다.
    /// 참조·다른 문서 이벤트는 리셋하지 않고 정상 Open은 리셋하는 양성 대조도 둔다.
    /// </summary>
    private static void ImportSequence()
    {
        var (fake, ui, engine, store) = Setup(3);
        var before = Revisions(store);
        var calls = fake.Calls;
        void EndOpen(bool active, bool merge, bool reference)
        {
            if (DocumentChangePolicy.ShouldReset(active, merge, reference))
            {
                engine.Reset(fake.Objects.Keys);
            }
        }

        // Import의 Add→EndOpen(Merge), 같은 형태의 Paste형 Add→EndOpen을 연속 재현한다.
        for (int index = 3; index < 5; index++)
        {
            var added = Object(index);
            fake.Objects.Add(added.Id, new(added.Payload, added.Box));
            engine.Dirty(added.Id);
            EndOpen(active: true, merge: true, reference: false);
        }
        EndOpen(active: false, merge: false, reference: false);
        EndOpen(active: true, merge: false, reference: true);
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(calls + 2, fake.Calls);
        var after = Revisions(store);
        Equal(5, after.Count);
        foreach (var (id, revision) in before)
        {
            Equal(revision, after[id]);
        }

        // 양성 대조: 정상 문서 열기는 기존 객체까지 전부 다시 빌드한다.
        EndOpen(active: true, merge: false, reference: false);
        engine.Start();
        ui.Until(() => !engine.Running);
        Equal(calls + 2 + 5, fake.Calls);
    }

    /// <summary>
    /// 요청 1 실행 중 요청 2가 오면 요청 1 완료가 요청 2를 지울 수 없다.
    /// hydrate 실패 두 번, 새 요청의 독립 예산, 이전 페이지의 늦은 완료도 함께 검사한다.
    /// </summary>
    private static void PullRace()
    {
        var signal = new PullSignal();
        Check(!signal.TryBegin(out _));
        signal.Signal();
        Check(signal.TryBegin(out var first));
        signal.Signal();
        Check(!signal.TryBegin(out _));
        signal.Complete(first, true);
        Check(signal.TryBegin(out var second), "진행 중 도착한 신호가 사라짐");
        Check(second.Revision > first.Revision);
        Equal(1, second.Attempt);
        signal.Complete(second, false);
        Check(signal.TryBegin(out var retry));
        Equal(2, retry.Attempt);
        signal.Complete(retry, false);
        Check(!signal.TryBegin(out _), "요청당 재시도 한도 초과");

        signal.Signal();
        Check(signal.TryBegin(out var third));
        signal.Signal();
        signal.Complete(third, false);
        Check(signal.TryBegin(out var latest));
        Equal(1, latest.Attempt);
        signal.ResetPage();
        signal.Signal();
        Check(signal.TryBegin(out var newPage));
        signal.Complete(latest, true);
        Check(!signal.TryBegin(out _), "옛 페이지 완료가 새 in-flight를 해제함");
        signal.Complete(newPage, true);
        Check(!signal.TryBegin(out _));
    }

    /// <summary>
    /// C1 스크립트의 return·동기 true 약속은 Eto 래퍼 안에서 그대로 유지해야 한다.
    /// 지역 숫자 형식과 잘못된 카메라 JSON이 지오메트리 발행에 섞이지 않는지도 본다.
    /// </summary>
    private static void Camera()
    {
        Equal("return !!(window.__rhinoPull && window.__rhinoPull() === true)", LiveScripts.Pull);
        Equal("return !!(window.__rhinoSetCamera && window.__rhinoSetCamera({\"x\":1}) === true)",
            LiveScripts.Camera("{\"x\":1}"));
        var culture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new("de-DE");
            using var document = JsonDocument.Parse(CameraPayload.CreateJson(
                10, 20, 30, 0.5, 12, 24, 36, 10, 22, 30, 0, 0, 2, .2, .3, true, 4, 8));
            var root = document.RootElement;
            Equal(1.0, root.GetProperty("pos")[0].GetDouble());
            Equal(1.0, root.GetProperty("up")[2].GetDouble());
            Equal(2.0, root.GetProperty("halfHeight").GetDouble());
        }
        finally
        {
            CultureInfo.CurrentCulture = culture;
        }
        Check(SceneJson.Camera("bad-json") == null);
    }

    /// <summary>
    /// 실제 TCP 응답으로 메모리 서빙·두 매니페스트 보관·gzip 헤더 계약을 확인한다.
    /// 보안 검사는 경로 가드가 없으면 실제 PRIVATE 파일을 읽는 경로로만 구성한다.
    /// </summary>
    private static async Task Server()
    {
        var root = Path.Combine(Temp, "www");
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "index.html"), "hello");
        var sentinel = Path.Combine(Temp, "sentinel.txt");
        File.WriteAllText(sentinel, "PRIVATE");
        var store = new MemoryLiveStore();
        using var server = new StaticFileServer(root, store);
        var obj = Object();
        var frame = SceneFrame.Calculate(new[] { obj.Box });
        Equal(404, (await Request(server.Port, "/live/state.json")).Status);
        store.Publish(new[] { obj }, frame, new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
        var state = await Request(server.Port, "/live/state.json");
        Equal(200, state.Status);
        Check(state.Headers.Contains("Cache-Control: no-store"));
        var response = await Request(server.Port, obj.Url);
        Equal(200, response.Status);
        Bytes(obj.Payload, response.Body);
        Check(!response.Headers.Contains("Content-Encoding", StringComparison.OrdinalIgnoreCase));
        Equal("RVM2", Encoding.ASCII.GetString(Gunzip(response.Body), 0, 4));
        var second = new SceneObject(obj.Id, 2, obj.Payload, obj.Box);
        store.Publish(new[] { second }, frame, new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
        Equal(200, (await Request(server.Port, obj.Url)).Status);
        store.Publish(new[] { new SceneObject(obj.Id, 3, obj.Payload, obj.Box) }, frame, new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
        Equal(404, (await Request(server.Port, obj.Url)).Status);
        Equal(200, (await Request(server.Port, second.Url)).Status);
        Equal(403, (await Request(server.Port, "/", "evil.test:" + server.Port)).Status);
        Equal(403, (await Request(server.Port, "/", "")).Status);
        Equal(403, (await Request(server.Port, "/", "127.0.0.1:" + server.Port + "\r\nHost: evil.test")).Status);
        // /live/ 경로는 항상 메모리 분기로 빠지므로 탈출 검사의 근거로 쓰지 않는다.
        // 아래 세 경로는 가드를 제거하면 실제 존재하는 같은 PRIVATE 파일을 읽게 된다.
        foreach (var path in new[] { "/%2e%2e/sentinel.txt", "/..%5csentinel.txt", "/nested/../../sentinel.txt" })
        {
            var denied = await Request(server.Port, path);
            Equal(403, denied.Status);
            Check(!Encoding.UTF8.GetString(denied.Body).Contains("PRIVATE"));
        }
        Equal("hello", Encoding.UTF8.GetString((await Request(server.Port, "/")).Body));
    }

    /// <summary>
    /// 매 라운드 새 rev와 새 바이트를 발행하면서 HTTP 독자가 state와 해당 메시를 읽는다.
    /// 독자가 두 세대 보관 범위를 넘지 않게 라운드를 묶어 정상 404와 순서 오류를 구별한다.
    /// </summary>
    private static async Task Concurrency()
    {
        var root = Path.Combine(Temp, "www");
        Directory.CreateDirectory(root);
        var store = new MemoryLiveStore();
        using var server = new StaticFileServer(root, store);
        var current = Object();
        var frame = SceneFrame.Calculate(new[] { current.Box });
        store.Publish(new[] { current }, frame, new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
        var requests = 0;
        for (int round = 1; round <= 100; round++)
        {
            var built = Built(round);
            var next = new SceneObject(current.Id, round + 1, built.Payload, built.Box);
            var hashes = new Dictionary<string, byte[]>
            {
                [current.Url] = SHA256.HashData(current.Payload),
                [next.Url] = SHA256.HashData(next.Payload)
            };
            var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var publisher = Task.Run(async () =>
            {
                await start.Task;
                store.Publish(new[] { next }, frame, new("#fff", null, new Dictionary<Guid, MaterialDescriptor>()));
            });
            var readers = Enumerable.Range(0, 10).Select(async index =>
            {
                await start.Task;
                var state = await Request(server.Port, "/live/state.json");
                Equal(200, state.Status);
                using var document = JsonDocument.Parse(state.Body);
                var url = document.RootElement.GetProperty("objects")[0].GetProperty("url").GetString()!;
                var body = await Request(server.Port, url);
                Equal(200, body.Status);
                Bytes(hashes[url], SHA256.HashData(body.Body));
                Interlocked.Increment(ref requests);
            }).ToArray();
            start.SetResult();
            await Task.WhenAll(readers.Append(publisher));
            // 다음 발행은 독자가 두 매니페스트 보관 범위를 벗어나지 않도록 현재 라운드 후에만 한다.
            current = next;
        }
        Equal(1000, requests);
        Console.WriteLine("PASS server concurrency evidence requests=1000 revisions=101 hashes=1000 intact");
    }

    private static async Task<(int Status, byte[] Body, string Headers)> Request(int port, string path, string? host = null)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var client = new TcpClient();
        await client.ConnectAsync("127.0.0.1", port, timeout.Token);
        var stream = client.GetStream();
        var request = "GET " + path + " HTTP/1.1\r\nHost: " + (host ?? "127.0.0.1:" + port) +
            "\r\nConnection: close\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(request), timeout.Token);
        using var all = new MemoryStream();
        await stream.CopyToAsync(all, timeout.Token);
        var bytes = all.ToArray();
        int end = -1;
        for (int index = 0; index < bytes.Length - 3; index++)
        {
            if (bytes[index] == 13 && bytes[index + 1] == 10 && bytes[index + 2] == 13 && bytes[index + 3] == 10)
            {
                end = index;
                break;
            }
        }
        Check(end > 0, "HTTP 헤더 누락");
        var headers = Encoding.ASCII.GetString(bytes, 0, end);
        var status = int.Parse(headers.Split(' ')[1]);
        var length = int.Parse(headers.Split("\r\n").Single(line => line.StartsWith("Content-Length:")).Split(':')[1]);
        var body = bytes[(end + 4)..];
        Equal(length, body.Length);
        return (status, body, headers);
    }
}
