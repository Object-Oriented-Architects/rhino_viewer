using System.Diagnostics;
using Rhino;

namespace RhinoViewer;

/// <summary>
/// 메시화와 대용량 파일 쓰기 중에도 Rhino 명령줄을 막지 않는다.
/// 라이브와 같이 최상위 객체 단위로 UI 캡처를 나누고, 문서와 분리한 사본만 백그라운드에 넘긴다.
/// </summary>
internal static class ExportJob
{
    private static int _running;

    public static void Start(RhinoDoc doc, string target, bool executable)
    {
        if (Interlocked.CompareExchange(ref _running, 1, 0) != 0)
            throw new InvalidOperationException("다른 내보내기가 진행 중입니다.");

        try
        {
            var job = new Job(doc, target, executable);
            RhinoDispatcher.Shared.Post(job.CaptureSlice);
        }
        catch
        {
            Interlocked.Exchange(ref _running, 0);
            throw;
        }
    }

    private sealed class Job
    {
        private readonly RhinoSceneDocument _adapter = new(() => true);
        private readonly List<(Guid Id, ISceneSnapshot Snapshot)> _snapshots = new();
        private readonly Queue<Guid> _ids;
        private readonly uint _serial;
        private readonly string _target;
        private readonly bool _executable;
        private bool _finished;

        public Job(RhinoDoc doc, string target, bool executable)
        {
            _serial = doc.RuntimeSerialNumber;
            _target = target;
            _executable = executable;
            _ids = new(RhinoSceneDocument.Objects(selectionOnly: true).Select(obj => obj.Id));
        }

        private void CheckDocument()
        {
            if (RhinoDoc.ActiveDoc?.RuntimeSerialNumber != _serial)
                throw new OperationCanceledException("문서가 변경되어 내보내기를 취소했습니다.");
        }

        private void Finish(Exception? error, int count = 0)
        {
            if (_finished)
                return;
            _finished = true;
            try
            {
                _adapter.Dispose();
            }
            catch (Exception ex)
            {
                error ??= ex;
            }
            Interlocked.Exchange(ref _running, 0);
            RhinoApp.WriteLine(error == null
                ? $"RhinoViewerExport: {_target} — 객체 {count}개"
                : "RhinoViewerExport: 실패 — " + error.Message);
        }

        private void ReleaseSnapshots()
        {
            Exception? error = null;
            foreach (var item in _snapshots)
            {
                try
                {
                    item.Snapshot.Dispose();
                }
                catch (Exception ex)
                {
                    error ??= ex;
                }
            }
            _snapshots.Clear();
            if (error != null)
                throw error;
        }

        public void CaptureSlice()
        {
            try
            {
                CheckDocument();
                var clock = Stopwatch.StartNew();
                while (_ids.TryDequeue(out var id))
                {
                    if (_adapter.Capture(id) is ISceneSnapshot snapshot)
                        _snapshots.Add((id, snapshot));
                    if (clock.ElapsedMilliseconds >= 10 && _ids.Count != 0)
                    {
                        RhinoDispatcher.Shared.Post(CaptureSlice);
                        return;
                    }
                }
                _ = Task.Run(Build).ContinueWith(
                    task => RhinoDispatcher.Shared.Post(() => OnBuilt(task)), TaskScheduler.Default);
            }
            catch (Exception ex)
            {
                try
                {
                    ReleaseSnapshots();
                }
                catch
                {
                    // 캡처 중 발생한 원래 오류를 보존한다.
                }
                Finish(ex);
            }
        }

        private List<SceneObject> Build()
        {
            try
            {
                var objects = new List<SceneObject>();
                foreach (var item in _snapshots)
                {
                    if (item.Snapshot.Build() is BuiltObject built)
                        objects.Add(new(item.Id, SceneCounters.Revision(), built.Payload, built.Box));
                }
                return objects;
            }
            finally
            {
                ReleaseSnapshots();
            }
        }

        private void OnBuilt(Task<List<SceneObject>> task)
        {
            if (!task.IsCompletedSuccessfully)
            {
                Finish(TaskError(task));
                return;
            }
            try
            {
                CheckDocument();
                var objects = task.Result;
                if (objects.Count == 0)
                    throw new InvalidOperationException("내보낼 장면이 없습니다.");
                var frame = SceneFrame.Calculate(objects.Select(obj => obj.Box));
                // 현재 UI 카메라를 쓴다. 라이브 패널의 프레임·동기화 토글과 독립이다.
                var presentation = _adapter.Presentation(frame);
                _ = Task.Run(() => Write(objects, frame, presentation)).ContinueWith(
                    written => RhinoDispatcher.Shared.Post(() => OnWritten(written, objects.Count)),
                    TaskScheduler.Default);
            }
            catch (Exception ex)
            {
                Finish(ex);
            }
        }

        private void Write(List<SceneObject> objects, SceneFrame frame, Presentation presentation)
        {
            var assets = EmbeddedAssets.ReadExport(_executable);
            using var template = assets.Template;
            void WriteHtml(Stream output) => SceneExport.WriteHtml(output, assets.Shell, objects, frame, presentation);
            if (template != null)
            {
                ExecutablePayload.Write(template, _target, WriteHtml);
            }
            else
            {
                using var output = File.Create(_target);
                WriteHtml(output);
            }
        }

        private void OnWritten(Task task, int count)
        {
            Finish(task.IsCompletedSuccessfully ? null : TaskError(task), count);
        }

        private static Exception TaskError(Task task) =>
            task.Exception?.GetBaseException() ?? new OperationCanceledException("내보내기가 취소되었습니다.");
    }
}
