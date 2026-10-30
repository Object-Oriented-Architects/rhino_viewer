using System.Reflection;
using Environment = System.Environment;
using Eto.Forms;
using Rhino;
using Rhino.DocObjects;
using Rhino.DocObjects.Tables;
using Rhino.Geometry;
using Rhino.Render;
using Rhino.UI;

namespace RhinoViewer;

[System.Runtime.InteropServices.Guid("9165DD25-D24B-4A73-BCE2-575780756703")]
public sealed class ViewerPanel : Panel, IPanel
{
    public static Guid PanelId => typeof(ViewerPanel).GUID;

    private readonly UITimer _syncTimer = new() { Interval = 0.35 };
    private readonly MemoryLiveStore _store = new();
    private readonly PullSignal _pull = new();
    private readonly Dictionary<uint, Guid[]> _transforms = new();
    private readonly HashSet<Guid> _changedLayers = new();
    private readonly HashSet<Guid> _changedDefinitions = new();
    private WebView? _webView;
    private StaticFileServer? _server;
    private RhinoSceneDocument? _document;
    private IncrementalScene? _scene;
    private string? _root;
    private string? _lastCameraJson;
    private string? _meshKey;
    private bool _disposed;
    private bool _started;
    private bool _waitingForWindow;
    private bool _isShown;
    private bool _pageLoaded;
    private bool _cameraInFlight;
    private bool _cameraSync = true;
    private bool _resetPending;
    private int _pageGeneration;
    private uint? _documentSerial;
    private long _lastIdleTick;

    public double ModelScale { get; internal set; } = 1;
    public Point3d ModelCenter { get; internal set; } = Point3d.Origin;
    internal bool CanSync => !_disposed && _isShown && _server != null;

    public bool CameraSyncEnabled
    {
        get => _cameraSync;
        set
        {
            if (_cameraSync == value)
                return;
            _cameraSync = value;
            ResetCameraTracking();
            _scene?.MetadataDirty();
            ScheduleSync();
        }
    }

    public ViewerPanel()
    {
        // 창 없는·숨은 RhinoCore 호스트(다른 플러그인의 확인 콘솔 등)도 사용자 프로필의 플러그인을 로드해
        // 이 패널을 만들 수 있다. WebView2·서버·문서 구독은 패널이 화면에 처음 보일 때 시작한다.
        _syncTimer.Elapsed += OnSyncTimer;
        // Rhino가 첫 표시에 PanelShown을 부르지 않는 경우에 대비한 보조 신호다.
        Shown += OnControlShown;
    }

    private void OnControlShown(object? sender, EventArgs e)
    {
        // Eto.Wpf는 WPF 가시성 전파 도중에 Shown을 부른다. Content 교체는 다음 UI 턴으로 미룬다.
        RhinoDispatcher.Shared.Post(() =>
        {
            if (_disposed || _started)
                return;
            _isShown = true;
            StartWhenVisible();
        });
    }

    // 창 없는 RhinoCore에서는 시작하지 않는다. 메인 창이 숨어 있으면 보일 때까지 Idle에서 기다린다.
    // 숨은 호스트는 끝까지 보이지 않고, 일반 Rhino는 PanelShown이 메인 창 표시보다 먼저 올 수 있다.
    private void StartWhenVisible()
    {
        if (_started || RhinoApp.IsRunningHeadless)
            return;
        if (RhinoWindow.Visible)
        {
            StartViewer();
            return;
        }
        if (_waitingForWindow)
            return;
        _waitingForWindow = true;
        RhinoApp.Idle += OnIdleUntilVisible;
    }

    private void OnIdleUntilVisible(object? sender, EventArgs e)
    {
        if (!_disposed && _isShown && !RhinoWindow.Visible)
            return;
        StopWaiting();
        if (!_disposed && _isShown)
            StartViewer();
    }

    private void StopWaiting()
    {
        if (!_waitingForWindow)
            return;
        _waitingForWindow = false;
        RhinoApp.Idle -= OnIdleUntilVisible;
    }

    private void StartViewer()
    {
        // 대기 중 창이 보인 뒤 Idle보다 PanelShown·Shown이 먼저 오면 두 경로가 모두 여기로 온다.
        if (_started)
            return;
        StopWaiting();
        _started = true;
        try
        {
            var environment = Environment.GetEnvironmentVariable("RHINOVIEWER_WEBROOT");
            IStaticFileSource source;
            if (!string.IsNullOrWhiteSpace(environment) && Directory.Exists(environment) &&
                File.Exists(Path.Combine(environment, "viewer-live", "index.html")))
            {
                _root = Path.GetFullPath(environment);
                source = new DiskFileSource(_root);
            }
            else
            {
                _root = "임베드 웹 자산";
                source = EmbeddedAssets.ReadWeb();
            }
            _server = new StaticFileServer(source, _store);
        }
        catch (Exception ex)
        {
            ShowError("뷰어 서버 시작 실패 — " + ex.Message);
            return;
        }

        // 예전에는 생성자 예외로 드러났다. 이제는 패널 안에 오류를 보이고, 남은 자원은 Dispose가 거둔다.
        try
        {
            _webView = new WebView();
            _webView.DocumentLoading += OnDocumentLoading;
            _webView.DocumentLoaded += OnDocumentLoaded;
            Content = _webView;
            _document = new RhinoSceneDocument(() => CameraSyncEnabled);
            _scene = new IncrementalScene(_document, RhinoDispatcher.Shared, _store);
            _scene.Preparing += ApplyDependencies;
            _scene.Failed += OnSyncFailed;
            _scene.Published += OnPublished;
            Subscribe(true);
            // 처음 보일 때 한 번만 발행한다. 이후 PanelShown은 깨끗한 장면을 다시 만들지 않는다.
            ResetDocument();
            _scene.Start();
            RhinoApp.WriteLine($"RhinoViewer: 웹 루트={_root} 포트={_server.Port}");
            _webView.Url = new Uri($"http://127.0.0.1:{_server.Port}/viewer-live/");
        }
        catch (Exception ex)
        {
            ShowError("뷰어 시작 실패 — " + ex.Message);
        }
    }

    private static void OnSyncFailed(Exception error) =>
        RhinoApp.WriteLine("RhinoViewer: 동기화 실패 — " + error.Message);

    private void OnPublished(SceneFrame frame)
    {
        ModelCenter = new(frame.Center.X, frame.Center.Y, frame.Center.Z);
        ModelScale = frame.Scale;
        ResetCameraTracking();
        SignalPull();
    }

    private void Subscribe(bool add)
    {
        if (add)
        {
            RhinoDoc.ActiveDocumentChanged += OnReset;
            RhinoDoc.NewDocument += OnReset;
            RhinoDoc.CloseDocument += OnReset;
            RhinoDoc.EndOpenDocument += OnEndOpen;
            RhinoDoc.DocumentPropertiesChanged += OnProperties;
            RhinoDoc.AddRhinoObject += OnAdd;
            RhinoDoc.UndeleteRhinoObject += OnAdd;
            RhinoDoc.DeleteRhinoObject += OnDelete;
            RhinoDoc.ReplaceRhinoObject += OnReplace;
            RhinoDoc.ModifyObjectAttributes += OnAttributes;
            RhinoDoc.BeforeTransformObjects += OnBeforeTransform;
            RhinoDoc.AfterTransformObjects += OnAfterTransform;
            RhinoDoc.LayerTableEvent += OnLayer;
            RhinoDoc.InstanceDefinitionTableEvent += OnDefinition;
            RenderContent.ContentChanged += OnMaterialChanged;
            RenderContent.ContentAdded += OnMaterialAdded;
            RenderContent.ContentDeleting += OnMaterialDeleted;
            RenderContent.ContentDeleted += OnMaterialDeleted;
            RenderContent.ContentReplacing += OnMaterialReplaced;
            RenderContent.ContentReplaced += OnMaterialReplaced;
            RhinoApp.Idle += OnIdle;
        }
        else
        {
            RhinoDoc.ActiveDocumentChanged -= OnReset;
            RhinoDoc.NewDocument -= OnReset;
            RhinoDoc.CloseDocument -= OnReset;
            RhinoDoc.EndOpenDocument -= OnEndOpen;
            RhinoDoc.DocumentPropertiesChanged -= OnProperties;
            RhinoDoc.AddRhinoObject -= OnAdd;
            RhinoDoc.UndeleteRhinoObject -= OnAdd;
            RhinoDoc.DeleteRhinoObject -= OnDelete;
            RhinoDoc.ReplaceRhinoObject -= OnReplace;
            RhinoDoc.ModifyObjectAttributes -= OnAttributes;
            RhinoDoc.BeforeTransformObjects -= OnBeforeTransform;
            RhinoDoc.AfterTransformObjects -= OnAfterTransform;
            RhinoDoc.LayerTableEvent -= OnLayer;
            RhinoDoc.InstanceDefinitionTableEvent -= OnDefinition;
            RenderContent.ContentChanged -= OnMaterialChanged;
            RenderContent.ContentAdded -= OnMaterialAdded;
            RenderContent.ContentDeleting -= OnMaterialDeleted;
            RenderContent.ContentDeleted -= OnMaterialDeleted;
            RenderContent.ContentReplacing -= OnMaterialReplaced;
            RenderContent.ContentReplaced -= OnMaterialReplaced;
            RhinoApp.Idle -= OnIdle;
        }
    }

    private void ResetDocument()
    {
        if (_disposed || _document == null || _scene == null)
            return;
        _document.Invalidate();
        _document.Materials.Clear();
        _documentSerial = RhinoDoc.ActiveDoc?.RuntimeSerialNumber;
        _meshKey = _document.MeshSettingsKey();
        _transforms.Clear();
        _changedLayers.Clear();
        _changedDefinitions.Clear();
        _scene.Reset(_document.AllIds());
    }

    internal bool ResyncAll()
    {
        if (_scene == null)
            return false;
        _syncTimer.Stop();
        ResetDocument();
        _scene.Start();
        return true;
    }

    private void OnEndOpen(object? sender, DocumentOpenEventArgs e)
    {
        if (DocumentChangePolicy.ShouldReset(Active(e.Document), e.Merge, e.Reference))
            QueueReset();
    }

    private void OnReset(object? sender, DocumentEventArgs e)
    {
        // 다른 플러그인의 headless 문서 이벤트는 현재 뷰어와 무관하다.
        var relevant = Active(e.Document) ||
            (_documentSerial.HasValue && e.DocumentSerialNumber == _documentSerial.Value);
        if (DocumentChangePolicy.ShouldReset(relevant))
            QueueReset();
    }

    private void QueueReset()
    {
        if (_disposed || _resetPending)
            return;
        _resetPending = true;
        // New/Close가 활성 문서 교체보다 먼저 올 수 있다. 세대는 즉시, 문서 조회는 다음 UI 턴에 바꾼다.
        _scene?.Reset(Array.Empty<Guid>());
        RhinoDispatcher.Shared.Post(() =>
        {
            _resetPending = false;
            if (_disposed)
                return;
            ResetDocument();
            ScheduleSync();
        });
    }

    private void OnProperties(object? sender, DocumentEventArgs e)
    {
        if (_document == null || !Active(e.Document))
            return;
        var key = _document.MeshSettingsKey();
        if (key != _meshKey)
            ResetDocument();
        else
            _scene?.MetadataDirty();
        ScheduleSync();
    }

    private static bool Active(RhinoDoc? doc) =>
        doc != null && doc.RuntimeSerialNumber == RhinoDoc.ActiveDoc?.RuntimeSerialNumber;

    private void Dirty(RhinoObject obj)
    {
        if (!Active(obj.Document) || obj.IsInstanceDefinitionGeometry)
            return;
        _document?.Invalidate(obj.Id);
        _scene?.Dirty(obj.Id);
        ScheduleSync();
    }

    private void OnAdd(object? sender, RhinoObjectEventArgs e) => Dirty(e.TheObject);

    private void OnDelete(object? sender, RhinoObjectEventArgs e)
    {
        if (!Active(e.TheObject.Document) || e.TheObject.IsInstanceDefinitionGeometry)
            return;
        _document?.Invalidate(e.ObjectId);
        _document?.Materials.References.Remove(e.ObjectId);
        _scene?.Delete(e.ObjectId);
        ScheduleSync();
    }

    private void OnReplace(object? sender, RhinoReplaceObjectEventArgs e)
    {
        if (!Active(e.Document) || e.OldRhinoObject.IsInstanceDefinitionGeometry)
            return;
        _document?.Invalidate(e.ObjectId);
        _scene?.Dirty(e.ObjectId);
        ScheduleSync();
    }

    private void OnAttributes(object? sender, RhinoModifyObjectAttributesEventArgs e) => Dirty(e.RhinoObject);

    private void OnBeforeTransform(object? sender, RhinoTransformObjectsEventArgs e)
    {
        // AfterTransform은 id만 주므로 Before의 객체 목록과 TransformEventId(8.15+)로 짝을 맞춘다.
        var moved = e.ObjectsWillBeCopied ? Array.Empty<RhinoObject>() : e.Objects ?? Array.Empty<RhinoObject>();
        _transforms[e.TransformEventId] = moved.Concat(e.GripOwners ?? Array.Empty<RhinoObject>())
            .Where(obj => Active(obj.Document) && !obj.IsInstanceDefinitionGeometry)
            .Select(obj => obj.Id).Distinct().ToArray();
    }

    private void OnAfterTransform(object? sender, RhinoAfterTransformObjectsEventArgs e)
    {
        if (!_transforms.Remove(e.TransformEventId, out var ids))
            return;
        foreach (var id in ids)
        {
            _document?.Invalidate(id);
            _scene?.Dirty(id);
        }
        ScheduleSync();
    }

    private void OnLayer(object? sender, LayerTableEventArgs e)
    {
        if (!Active(e.Document) || e.EventType != LayerTableEventType.Modified)
            return;
        var layer = e.NewState ?? e.OldState;
        if (layer != null)
            _changedLayers.Add(layer.Id);
        _scene?.MetadataDirty();
        ScheduleSync();
    }

    private void OnDefinition(object? sender, InstanceDefinitionTableEventArgs e)
    {
        if (!Active(e.Document))
            return;
        var definition = e.NewState ?? e.OldState;
        if (definition != null)
            _changedDefinitions.Add(definition.Id);
        _scene?.MetadataDirty();
        ScheduleSync();
    }

    private void OnMaterialChanged(object? sender, RenderContentChangedEventArgs e) =>
        QueueMaterial(e, MaterialEvent.Changed, e.ChangeContext == RenderContent.ChangeContexts.Ignore);

    private void OnMaterialAdded(object? sender, RenderContentEventArgs e) =>
        QueueMaterial(e, MaterialEvent.Added);

    private void OnMaterialDeleted(object? sender, RenderContentEventArgs e) =>
        QueueMaterial(e, MaterialEvent.Deleted);

    private void OnMaterialReplaced(object? sender, RenderContentEventArgs e) =>
        QueueMaterial(e, MaterialEvent.Replaced);

    private void QueueMaterial(RenderContentEventArgs e, MaterialEvent change, bool ignoreContext = false)
    {
        if (_disposed || _document == null || RhinoMaterials.Reading || !Active(e.Document))
            return;
        var content = e.Content;
        if (content == null || (content.TopLevelParent ?? content) is not RenderMaterial material)
            return;
        var id = material.Id;
        var topLevel = content.Id == id;
        var serial = e.Document.RuntimeSerialNumber;
        // 분리 전 Deleting·Replacing에서도 부모와 옛 id를 잡고, 삭제 후 무효일 수 있는 콘텐츠는 넘기지 않는다.
        RhinoDispatcher.Shared.Post(() =>
        {
            var doc = RhinoDoc.ActiveDoc;
            if (_disposed || _document == null || doc?.RuntimeSerialNumber != serial)
                return;
            var update = _document.Materials.Changed(doc, id, change, topLevel, ignoreContext);
            if (update == MaterialUpdate.Ignore)
                return;
            if (update == MaterialUpdate.Dirty)
            {
                foreach (var obj in _document.Materials.References.Affected(new HashSet<Guid> { id }))
                    _scene?.Dirty(obj);
            }
            // 재질 변경은 정의 메시 캐시를 무효화하지 않는다.
            _scene?.MetadataDirty();
            ScheduleSync();
        });
    }

    private void ApplyDependencies()
    {
        if (_document == null || (_changedLayers.Count == 0 && _changedDefinitions.Count == 0))
            return;
        foreach (var id in _document.Affected(_changedLayers, _changedDefinitions))
            _scene?.Dirty(id);
        _changedLayers.Clear();
        _changedDefinitions.Clear();
    }

    private void ScheduleSync()
    {
        _syncTimer.Stop();
        if (CanSync && _scene != null)
            _syncTimer.Start();
    }

    private void OnSyncTimer(object? sender, EventArgs e)
    {
        _syncTimer.Stop();
        if (CanSync)
            _scene?.Start();
    }

    private void OnDocumentLoading(object? sender, WebViewLoadingEventArgs e)
    {
        _pageLoaded = false;
        _pageGeneration++;
        _pull.ResetPage();
        ResetCameraTracking();
        RhinoApp.WriteLine($"RhinoViewer: 페이지 로드 시작 {e.Uri}");
    }

    private void OnDocumentLoaded(object? sender, WebViewLoadedEventArgs e)
    {
        _pageLoaded = true;
        ResetCameraTracking();
        RhinoApp.WriteLine($"RhinoViewer: 페이지 로드 완료 {e.Uri}");
        SignalPull();
    }

    internal void ResetCameraTracking() => _lastCameraJson = null;

    internal void SignalPull()
    {
        _pull.Signal();
        TryPull();
    }

    private async void TryPull()
    {
        if (_webView is not WebView webView || !CanSync || !_pageLoaded || !_pull.TryBegin(out var request))
            return;
        try
        {
            var result = await webView.ExecuteScriptAsync(LiveScripts.Pull).ConfigureAwait(false);
            RhinoDispatcher.Shared.Post(() => _pull.Complete(request, result == "true"));
        }
        catch (Exception ex)
        {
            RhinoDispatcher.Shared.Post(() =>
            {
                _pull.Complete(request, false);
                if (!_disposed)
                    RhinoApp.WriteLine("RhinoViewer: 갱신 신호 JS 실패 — " + ex.Message);
            });
        }
    }

    internal async void RunCameraScript(string json)
    {
        if (_webView is not WebView webView || !CanSync || !_pageLoaded || !CameraSyncEnabled || _cameraInFlight ||
            json == _lastCameraJson)
            return;
        _cameraInFlight = true;
        var page = _pageGeneration;
        try
        {
            var result = await webView.ExecuteScriptAsync(LiveScripts.Camera(json)).ConfigureAwait(false);
            RhinoDispatcher.Shared.Post(() =>
            {
                if (!_disposed && page == _pageGeneration && CameraSyncEnabled && result == "true")
                    _lastCameraJson = json;
                _cameraInFlight = false;
            });
        }
        catch (Exception ex)
        {
            RhinoDispatcher.Shared.Post(() =>
            {
                _cameraInFlight = false;
                if (!_disposed)
                    RhinoApp.WriteLine("RhinoViewer: 카메라 JS 실패 — " + ex.Message);
            });
        }
    }

    private void OnIdle(object? sender, EventArgs e)
    {
        if (!CanSync || !_pageLoaded)
            return;
        var now = Environment.TickCount64;
        if (now - _lastIdleTick < 80)
            return;
        _lastIdleTick = now;
        TryPull();
        if (RhinoDoc.ActiveDoc is RhinoDoc doc)
            SceneSync.PushCamera(doc, this);
    }

    public void PanelShown(uint documentSerialNumber, ShowPanelReason reason)
    {
        if (_disposed)
            return;
        _isShown = true;
        ResetCameraTracking();
        if (!_started)
        {
            StartWhenVisible();
            return;
        }
        if (_scene == null)
            return;
        _scene.Visible = true;
        if (_scene.HasPending)
            _scene.Start();
    }

    public void PanelHidden(uint documentSerialNumber, ShowPanelReason reason) => SuspendSync();

    public void PanelClosing(uint documentSerialNumber, bool onCloseDocument) => SuspendSync();

    private void SuspendSync()
    {
        _isShown = false;
        _syncTimer.Stop();
        ResetCameraTracking();
        if (_scene != null)
            _scene.Visible = false;
    }

    /// <summary>
    /// RhinoViewerDiagnostics — 패널이 실제로 무엇을 보고 있는지 Rhino 명령줄에 찍는다.
    /// Eto 핸들러·WebView2 초기화 상태·페이지 상태를 함께 노출한다.
    /// </summary>
    public async void ReportState()
    {
        if (_webView is not WebView webView)
        {
            RhinoApp.WriteLine($"[진단] 뷰어 미시작 — 시작 시도={_started} 패널 표시={_isShown} " +
                $"headless={RhinoApp.IsRunningHeadless} 메인 창 표시={RhinoWindow.Visible}");
            return;
        }
        RhinoApp.WriteLine($"[진단] 웹 루트={_root} 포트={_server?.Port} 주소={webView.Url}");
        RhinoApp.WriteLine($"[진단] 동기화 중={_scene?.Running} 대기 변경={_scene?.HasPending}");
        var handler = webView.Handler;
        RhinoApp.WriteLine($"[진단] 핸들러={handler?.GetType().FullName ?? "(없음)"}");
        if (handler == null)
            return;
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        var ready = handler.GetType().GetField("webView2Ready", flags)?.GetValue(handler);
        var core = handler.GetType().GetProperty("CoreWebView2", flags)?.GetValue(handler);
        RhinoApp.WriteLine($"[진단] WebView2 준비={ready} 코어 초기화={core != null}");
        if (!_pageLoaded)
            return;

        const string script = "return JSON.stringify({ready:document.readyState," +
            "canvas:document.querySelectorAll('canvas').length," +
            "state:window.__VIEWER_STATE&&window.__VIEWER_STATE(),errors:window.__RHINOVIEW_ERRORS||[]})";
        try
        {
            var result = await webView.ExecuteScriptAsync(script).ConfigureAwait(false);
            RhinoDispatcher.Shared.Post(() => RhinoApp.WriteLine("[진단] 페이지=" + result));
        }
        catch (Exception ex)
        {
            RhinoDispatcher.Shared.Post(() => RhinoApp.WriteLine("[진단] 조회 실패 — " + ex.Message));
        }
    }

    private void ShowError(string message)
    {
        RhinoApp.WriteLine("RhinoViewer: " + message.Replace("\n", " "));
        Content = new Label { Text = "RhinoViewer\n\n" + message };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !_disposed)
        {
            SuspendSync();
            StopWaiting();
            _disposed = true;
            Shown -= OnControlShown;
            if (_scene != null)
            {
                _scene.Reset(Array.Empty<Guid>());
                Subscribe(false);
            }
            _syncTimer.Elapsed -= OnSyncTimer;
            _syncTimer.Dispose();
            if (_webView != null)
            {
                _webView.DocumentLoading -= OnDocumentLoading;
                _webView.DocumentLoaded -= OnDocumentLoaded;
            }
            _document?.Dispose();
            _server?.Dispose();
            _webView?.Dispose();
        }
        base.Dispose(disposing);
    }
}

/// <summary>Rhino 메인 창이 화면에 떠 있는지 — 창을 숨긴 RhinoCore 호스트를 거른다.</summary>
internal static class RhinoWindow
{
    public static bool Visible
    {
        get
        {
            if (!OperatingSystem.IsWindows())
                return true;
            var handle = RhinoApp.MainWindowHandle();
            return handle != IntPtr.Zero && IsWindowVisible(handle);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr window);
}
