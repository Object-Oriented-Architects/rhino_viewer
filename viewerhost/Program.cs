using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace RhinoViewerHost
{
    internal static class Program
    {
        private static readonly Dictionary<string, Assembly> Assemblies = new Dictionary<string, Assembly>();

        // Keep the entry point free of WebView2 types: resolution must be installed before JIT
        // compilation of any method which references a WebView2 assembly.
        [STAThread]
        private static int Main(string[] args)
        {
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedAssembly;
            return Start(args);
        }

        private static Assembly ResolveEmbeddedAssembly(object sender, ResolveEventArgs args)
        {
            string name = new AssemblyName(args.Name).Name;
            if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms")
                return null;
            lock (Assemblies)
            {
                Assembly assembly;
                if (Assemblies.TryGetValue(name, out assembly))
                    return assembly;
                using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Embedded." + name + ".dll"))
                {
                    if (resource == null) return null;
                    using (var buffer = new MemoryStream())
                    {
                        resource.CopyTo(buffer);
                        assembly = Assembly.Load(buffer.ToArray());
                        Assemblies.Add(name, assembly);
                        return assembly;
                    }
                }
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private static int Start(string[] args)
        {
            var elapsed = Stopwatch.StartNew();
            HostOptions options = null;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                options = HostOptions.Parse(args);
                if (options.Probe) Directory.CreateDirectory(Path.GetDirectoryName(options.ProbePath));
                string exe = Assembly.GetEntryAssembly().Location;
                Scene scene = Payload.Extract(exe);
                if (scene == null)
                {
                    if (options.Probe)
                        JsonFile.Write(options.ProbePath, new { error = "no-payload" });
                    else
                        MessageBox.Show("내장된 장면이 없습니다", Path.GetFileNameWithoutExtension(exe),
                            MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 3;
                }
                return ViewerWindow.Run(options, scene, elapsed, Path.GetFileNameWithoutExtension(exe));
            }
            catch (Exception ex)
            {
                if (options != null && options.Probe)
                    JsonFile.Write(options.ProbePath, new { error = "startup-failed", message = ex.ToString(), elapsedMs = elapsed.ElapsedMilliseconds });
                else
                    MessageBox.Show(ex.Message, "RhinoViewerHost", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }

    internal sealed class HostOptions
    {
        public string ProbePath { get; private set; }
        public bool Probe { get { return ProbePath != null; } }
        public int WaitMs { get; private set; } = 60000;

        public static HostOptions Parse(string[] args)
        {
            var result = new HostOptions();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--probe" && i + 1 < args.Length)
                    result.ProbePath = Path.GetFullPath(args[++i]);
                else if (args[i] == "--wait" && i + 1 < args.Length)
                {
                    int wait;
                    if (!int.TryParse(args[++i], out wait) || wait <= 0)
                        throw new ArgumentException("--wait must be a positive number of milliseconds.");
                    result.WaitMs = wait;
                }
                else
                    throw new ArgumentException("Usage: RhinoViewerHost.exe [--probe <out.json> [--wait <ms>]]");
            }
            return result;
        }
    }
}
