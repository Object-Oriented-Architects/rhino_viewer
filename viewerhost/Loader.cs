using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;

namespace RhinoViewerHost
{
    internal static class Loader
    {
        public static string Extract()
        {
            // The project is deliberately x64, including on Windows ARM64 under x64 emulation.
            if (!Environment.Is64BitProcess)
                throw new PlatformNotSupportedException("RhinoViewerHost requires a 64-bit process.");
            string version = Assembly.GetExecutingAssembly().GetCustomAttributes<AssemblyMetadataAttribute>()
                .Single(a => a.Key == "WebView2SdkVersion").Value;
            string folder = Path.Combine(Payload.LocalRoot, "bin", version, "x64");
            Directory.CreateDirectory(folder);
            string destination = Path.Combine(folder, "WebView2Loader.dll");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Embedded.x64.WebView2Loader.dll"))
            using (var bytes = new MemoryStream())
            {
                if (resource == null) throw new FileNotFoundException("Embedded WebView2Loader.dll is missing.");
                resource.CopyTo(bytes);
                byte[] expected = bytes.ToArray();
                if (File.Exists(destination))
                {
                    using (var file = File.OpenRead(destination))
                    using (var sha = SHA256.Create())
                        if (sha.ComputeHash(file).SequenceEqual(sha.ComputeHash(expected)))
                            return folder;
                    // Never overwrite a loaded DLL. A corrupt locked cache gets an actionable startup error.
                }
                string temp = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".tmp");
                try
                {
                    File.WriteAllBytes(temp, expected);
                    if (File.Exists(destination))
                    {
                        // Another host may have won the extraction race while this one was writing.
                        using (var file = File.OpenRead(destination))
                        using (var sha = SHA256.Create())
                            if (sha.ComputeHash(file).SequenceEqual(sha.ComputeHash(expected)))
                                return folder;
                        File.Delete(destination);
                    }
                    try { File.Move(temp, destination); }
                    catch (IOException)
                    {
                        if (!File.Exists(destination)) throw;
                        using (var file = File.OpenRead(destination))
                        using (var sha = SHA256.Create())
                            if (!sha.ComputeHash(file).SequenceEqual(sha.ComputeHash(expected))) throw;
                    }
                    return folder;
                }
                finally { if (File.Exists(temp)) File.Delete(temp); }
            }
        }
    }
}
