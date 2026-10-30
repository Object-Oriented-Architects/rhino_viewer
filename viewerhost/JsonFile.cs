using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace RhinoViewerHost
{
    internal static class JsonFile
    {
        public static JavaScriptSerializer Serializer()
        {
            return new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 128 };
        }

        public static void Write(string path, object value)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            File.WriteAllText(path, Serializer().Serialize(value), new UTF8Encoding(false));
        }
    }
}
