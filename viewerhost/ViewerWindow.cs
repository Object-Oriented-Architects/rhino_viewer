using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RhinoViewerHost
{
    internal sealed class ViewerWindow : Form
    {
        private const string RuntimeUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
        private const string ProbeScript = "JSON.stringify({canvas:document.querySelectorAll('canvas').length, spinner:!!document.querySelector('.animate-spin'), errors:window.__RHINOVIEW_ERRORS||null, state: window.__VIEWER_STATE ? window.__VIEWER_STATE() : null})";
        private readonly HostOptions options;
        private readonly Scene scene;
        private readonly Stopwatch elapsed;
        private readonly WebView2 webView;
        private Dictionary<string, object> lastProbe = new Dictionary<string, object>();
        private string captureCondition;
        private string runtimeVersion;
        private object diagnostics;
        private readonly List<object> resourceFailures = new List<object>();
        private int exitCode;

        private ViewerWindow(HostOptions options, Scene scene, Stopwatch elapsed, string title)
        {
            this.options = options;
            this.scene = scene;
            this.elapsed = elapsed;
            exitCode = options.Probe ? 1 : 0;
            Text = title;
            Size = new Size(1280, 800);
            StartPosition = FormStartPosition.CenterScreen;
            if (options.Probe)
            {
                // Minimized CapturePreviewAsync can hang on a static canvas (measured in extra C5 test).
                // Use a normal, non-activating off-screen window so the compositor keeps rendering.
                StartPosition = FormStartPosition.Manual;
                Location = new Point(SystemInformation.VirtualScreen.Right + 100, SystemInformation.VirtualScreen.Top + 100);
                ShowInTaskbar = false;
            }
            webView = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(webView);
            Shown += OnShown;
        }

        protected override bool ShowWithoutActivation { get { return options.Probe; } }

        [MethodImpl(MethodImplOptions.NoInlining)]
        public static int Run(HostOptions options, Scene scene, Stopwatch elapsed, string title)
        {
            using (var window = new ViewerWindow(options, scene, elapsed, title))
            {
                Application.Run(window);
                return window.exitCode;
            }
        }

        private async void OnShown(object sender, EventArgs args)
        {
            try
            {
                // SDK XML: call SetLoaderDllFolderPath before ANY other static environment API.
                CoreWebView2Environment.SetLoaderDllFolderPath(Loader.Extract());
                CoreWebView2Environment environment;
                try
                {
                    environment = await Within(CoreWebView2Environment.CreateAsync(
                        null, Path.Combine(Payload.LocalRoot, "WebView2")));
                }
                catch (TimeoutException) { throw; }
                catch (Exception ex)
                {
                    throw new InvalidOperationException(
                        "WebView2 환경을 만들 수 없습니다. WebView2 Runtime이 설치되어 있는지 확인해 주세요.\n" +
                        "설치: " + RuntimeUrl + "\n원인: " + ex.Message, ex);
                }
                runtimeVersion = environment.BrowserVersionString;
                await Within(webView.EnsureCoreWebView2Async(environment));
                var core = webView.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.NewWindowRequested += OnNewWindowRequested;
                core.SetVirtualHostNameToFolderMapping("rhinoviewer.example", scene.Root,
                    CoreWebView2HostResourceAccessKind.Allow);

                if (options.Probe)
                {
                    // Keep the page's own error array untouched; include separate diagnostics in probe reports.
                    core.WebResourceResponseReceived += (_, e) =>
                    {
                        if (e.Response.StatusCode >= 400 && resourceFailures.Count < 128)
                            resourceFailures.Add(new { uri = e.Request.Uri, status = e.Response.StatusCode });
                    };
                    await Within(core.AddScriptToExecuteOnDocumentCreatedAsync(
                        "window.__RHINOVIEW_HOST_DIAGNOSTICS=[];" +
                        "function rhvDescribe(e){var t=e&&e.target;return {message:e&&(e.message||String(e)),tag:t&&t.tagName,url:t&&(t.src||t.href),file:e&&e.filename,line:e&&e.lineno};}" +
                        "window.addEventListener('error',function(e){if(window.__RHINOVIEW_HOST_DIAGNOSTICS.length<128)window.__RHINOVIEW_HOST_DIAGNOSTICS.push(rhvDescribe(e));},true);" +
                        "window.addEventListener('unhandledrejection',function(e){if(window.__RHINOVIEW_HOST_DIAGNOSTICS.length<128)window.__RHINOVIEW_HOST_DIAGNOSTICS.push(rhvDescribe(e.reason));});"));
                    var navigation = new TaskCompletionSource<bool>();
                    core.NavigationCompleted += (_, e) =>
                    {
                        if (e.IsSuccess) navigation.TrySetResult(true);
                        else navigation.TrySetException(new IOException("Navigation failed: " + e.WebErrorStatus));
                    };
                    core.Navigate("https://rhinoviewer.example/" + scene.Hash + "/index.html");
                    await Within(navigation.Task);
                    await ProbeAsync();
                    exitCode = 0;
                    Close();
                }
                else
                    core.Navigate("https://rhinoviewer.example/" + scene.Hash + "/index.html");
            }
            catch (Exception ex)
            {
                exitCode = ex is TimeoutException ? 2 : 1;
                if (options.Probe)
                {
                    try { WriteProbe(ex is TimeoutException ? "timeout" : "webview2-failed", ex.ToString(), false); }
                    catch { exitCode = 1; } // An unwritable probe target must never open a modal dialog.
                }
                else
                    MessageBox.Show(this, ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                if (!IsDisposed) Close();
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            Uri uri;
            // Do not let exported HTML launch local executables or arbitrary registered URI handlers.
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) ||
                (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
                return;
            try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
            catch (Exception ex)
            {
                if (!options.Probe)
                    MessageBox.Show(this, ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private async Task ProbeAsync()
        {
            long readySince = -1;
            string previousCondition = null;
            while (true)
            {
                string encoded = await Within(webView.CoreWebView2.ExecuteScriptAsync(ProbeScript));
                var serializer = JsonFile.Serializer();
                string json = serializer.Deserialize<string>(encoded); // ExecuteScriptAsync encodes the JSON.stringify string again.
                lastProbe = json == null ? new Dictionary<string, object>() :
                    serializer.Deserialize<Dictionary<string, object>>(json);
                if (lastProbe == null) lastProbe = new Dictionary<string, object>();
                object stateValue, spinnerValue, canvasValue;
                lastProbe.TryGetValue("state", out stateValue);
                lastProbe.TryGetValue("spinner", out spinnerValue);
                lastProbe.TryGetValue("canvas", out canvasValue);
                var state = stateValue as Dictionary<string, object>;
                bool hasModelBox = state != null && state.ContainsKey("modelBox");
                bool idle = spinnerValue is bool && !(bool)spinnerValue;
                bool ready = hasModelBox ? idle && state["modelBox"] != null :
                    idle && canvasValue != null && Convert.ToInt32(canvasValue) >= 1;
                captureCondition = ready ? (hasModelBox ? "modelBox+2s" : "legacy-canvas+5s") : null;
                if (!ready || captureCondition != previousCondition)
                    readySince = ready ? elapsed.ElapsedMilliseconds : -1;
                previousCondition = captureCondition;
                int settleMs = hasModelBox ? 2000 : 5000;
                if (ready && elapsed.ElapsedMilliseconds - readySince >= settleMs)
                {
                    string screenshot = options.ProbePath + ".png";
                    string temporaryScreenshot = screenshot + ".tmp";
                    try
                    {
                        using (var output = File.Create(temporaryScreenshot))
                            await Within(webView.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, output));
                        if (File.Exists(screenshot)) File.Delete(screenshot);
                        File.Move(temporaryScreenshot, screenshot);
                    }
                    finally { if (File.Exists(temporaryScreenshot)) File.Delete(temporaryScreenshot); }
                    string diagnosticJson = await Within(webView.CoreWebView2.ExecuteScriptAsync(
                        "JSON.stringify(window.__RHINOVIEW_HOST_DIAGNOSTICS||[])"));
                    diagnostics = serializer.DeserializeObject(serializer.Deserialize<string>(diagnosticJson));
                    WriteProbe(null, null, true);
                    return;
                }
                await Within(Task.Delay(1000));
            }
        }

        private void WriteProbe(string error, string message, bool captured)
        {
            var report = new Dictionary<string, object>(lastProbe);
            report["elapsedMs"] = elapsed.ElapsedMilliseconds;
            report["sceneFolder"] = scene.Folder;
            report["sceneReused"] = scene.Reused;
            report["captureCondition"] = captureCondition;
            report["captured"] = captured;
            report["windowMode"] = options.Probe ? "offscreen-normal" : "normal";
            report["runtimeVersion"] = runtimeVersion;
            report["diagnostics"] = diagnostics;
            report["resourceFailures"] = resourceFailures;
            if (captured) report["screenshotPath"] = options.ProbePath + ".png";
            if (error != null) { report["error"] = error; report["message"] = message; }
            JsonFile.Write(options.ProbePath, report);
        }

        private async Task Within(Task operation)
        {
            if (!options.Probe) { await operation; return; }
            long remaining = options.WaitMs - elapsed.ElapsedMilliseconds;
            if (remaining <= 0 || await Task.WhenAny(operation, Task.Delay((int)Math.Min(int.MaxValue, remaining))) != operation)
                throw new TimeoutException("Probe exceeded --wait " + options.WaitMs + " ms.");
            await operation;
        }

        private async Task<T> Within<T>(Task<T> operation)
        {
            await Within((Task)operation);
            return await operation;
        }
    }
}
