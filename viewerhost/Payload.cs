using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace RhinoViewerHost
{
    internal sealed class Scene
    {
        public string Hash { get; set; }
        public string Folder { get; set; }
        public bool Reused { get; set; }
        public string Root { get { return Path.GetDirectoryName(Folder); } }
    }

    internal static class Payload
    {
        public static string LocalRoot
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RhinoViewerHost"); }
        }

        public static Scene Extract(string exe)
        {
            using (var input = new FileStream(exe, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (input.Length < 17) return null;
                input.Position = input.Length - 16;
                long length;
                using (var reader = new BinaryReader(input, Encoding.ASCII, true))
                {
                    length = reader.ReadInt64(); // BinaryReader is explicitly little-endian.
                    if (Encoding.ASCII.GetString(reader.ReadBytes(8)) != "RVHTML01")
                        return null;
                }
                if (length <= 0 || length >= input.Length - 16) return null;
                long start = input.Length - 16 - length;
                input.Position = start;
                string fullHash = Hash(input, length);
                string hash = fullHash.Substring(0, 16);
                string folder = Path.Combine(LocalRoot, "scenes", hash);
                string index = Path.Combine(folder, "index.html");
                bool owns = false;
                using (var mutex = new Mutex(false, "Local\\RhinoViewerHost-scene-" + hash))
                {
                    try
                    {
                        try { owns = mutex.WaitOne(30000); }
                        catch (AbandonedMutexException) { owns = true; }
                        if (!owns) throw new IOException("Timed out waiting for scene extraction.");
                        Directory.CreateDirectory(folder);
                        // Verify the cached contents as well: a truncated/modified cache must not be reused.
                        if (File.Exists(index) && new FileInfo(index).Length == length)
                        {
                            using (var cached = File.OpenRead(index))
                                if (Hash(cached, length) == fullHash)
                                    return new Scene { Hash = hash, Folder = folder, Reused = true };
                        }
                        string temp = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".tmp");
                        try
                        {
                            input.Position = start;
                            using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                            {
                                Copy(input, output, length);
                                output.Flush(true);
                            }
                            if (File.Exists(index)) File.Delete(index);
                            File.Move(temp, index); // Publish only a complete HTML file.
                        }
                        finally { if (File.Exists(temp)) File.Delete(temp); }
                        return new Scene { Hash = hash, Folder = folder, Reused = false };
                    }
                    finally { if (owns) mutex.ReleaseMutex(); }
                }
            }
        }

        private static string Hash(Stream input, long length)
        {
            using (var sha = SHA256.Create())
            {
                var buffer = new byte[128 * 1024];
                while (length > 0)
                {
                    int count = input.Read(buffer, 0, (int)Math.Min(buffer.Length, length));
                    if (count == 0) throw new EndOfStreamException("Unexpected end of HTML payload.");
                    sha.TransformBlock(buffer, 0, count, buffer, 0);
                    length -= count;
                }
                sha.TransformFinalBlock(new byte[0], 0, 0);
                return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
            }
        }

        private static void Copy(Stream input, Stream output, long length)
        {
            var buffer = new byte[128 * 1024];
            while (length > 0)
            {
                int count = input.Read(buffer, 0, (int)Math.Min(buffer.Length, length));
                if (count == 0) throw new EndOfStreamException("Unexpected end of HTML payload.");
                output.Write(buffer, 0, count);
                length -= count;
            }
        }
    }
}
