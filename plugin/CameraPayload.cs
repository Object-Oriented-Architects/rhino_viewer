using System;
using System.Text.Json;

namespace RhinoViewer;

/// <summary>C1 카메라 직렬화. Rhino 객체와 현재 지역 숫자 형식에 의존하지 않는다.</summary>
internal static class CameraPayload
{
    public static string CreateJson(
        double centerX, double centerY, double centerZ, double scale,
        double posX, double posY, double posZ,
        double targetX, double targetY, double targetZ,
        double upX, double upY, double upZ,
        double halfV, double halfH, bool parallel, double halfHeight, double halfWidth)
    {
        var upLength = Math.Sqrt(upX * upX + upY * upY + upZ * upZ);
        if (upLength <= 1e-12 || !double.IsFinite(upLength))
            throw new ArgumentException("카메라 위쪽 방향은 유한한 0이 아닌 벡터여야 합니다.");

        return JsonSerializer.Serialize(new
        {
            pos = new[] { (posX - centerX) * scale, (posY - centerY) * scale, (posZ - centerZ) * scale },
            target = new[] { (targetX - centerX) * scale, (targetY - centerY) * scale, (targetZ - centerZ) * scale },
            up = new[] { upX / upLength, upY / upLength, upZ / upLength },
            halfV,
            halfH,
            parallel,
            halfHeight = halfHeight * scale,
            halfWidth = halfWidth * scale,
        });
    }
}
