import * as THREE from 'three'
import { MeshBVH, MeshBVHUniformStruct, SAH, shaderStructs, shaderIntersectFunction } from 'three-mesh-bvh'

/**
 * 분산 품질
 * 0 = 내부 광선 1개 + 탈출 시 RGB 방향 오프셋 (pavé·저사양용, 가장 빠름)
 * 1 = R·G·B 3광선 독립 추적
 * 2 = 6밴드 스펙트럼 추적 (최고 품질)
 */
export type DispersionMode = 0 | 1 | 2

export interface DiamondMaterialOptions {
  /** 선명한(PMREM 아님) cube 환경맵 — mipmap 필요 */
  envMap?: THREE.CubeTexture | null
  /** 환경맵 샘플링 회전 — 금속(scene.environmentRotation)과 같은 규약으로 GemEnvironment가 계산 */
  envRotation?: THREE.Matrix3
  envMapIntensity?: number
  /**
   * 환경 샘플링 mip 레벨 — 클수록 핀라이트 경계가 부드러워진다. 광선 추적 루프 안이라 자동 mip 선택이
   * 안 되고(ANGLE이 mip 0으로 고정) 명시적으로 지정한다. pavé는 facet 전체가 핀라이트 경계를 넘는 순간
   * 한 프레임에 켜졌다 꺼지며 자글거리므로 경계를 부드럽게 해 완화한다.
   */
  envBlur?: number
  ior?: number
  /** 내부 반사 횟수 (최대 7) */
  bounces?: number
  /** 분산 폭 — 굴절률을 ior ± aberrationStrength 범위로 벌린다 (다이아몬드 실측 폭 0.044 ≈ 0.022~0.024) */
  aberrationStrength?: number
  dispersionMode?: DispersionMode
  color?: THREE.ColorRepresentation
  /** Beer-Lambert 흡수 계수 배율 — 색 있는 보석의 깊이감 */
  absorptionFactor?: number
  /** 겉면 반사율 f0에 더하는 값 */
  fresnelBias?: number
  /** 아주 밝은 핀라이트 반사만 추가로 끌어올리는 정도 */
  sparkleIntensity?: number
  /**
   * 픽셀당 진입 광선 수 (1–4). 몇 픽셀짜리 pavé는 facet 경계가 픽셀보다 작아 회전할 때
   * 픽셀이 다른 facet으로 튀며 자글거린다 — 서브픽셀마다 실제 진입 facet을 다시 찾아 평균한다(셰이더 내 SSAA).
   */
  pixelSamples?: number
  /**
   * 금속 받침 가림 맵 (settingOcclusion.ts가 스톤마다 구운 팔면체 맵) — 탈출 방향이 금속에 막히면 환경 대신
   * settingColor를 읽는다. null이거나 settingStrength 0이면 끔
   */
  settingOcclusion?: THREE.Texture | null
  /** 가림 적용 정도 (0–1) */
  settingStrength?: number
  /** 받침 속에 갇힌 빛의 색 — 선형 HDR, 환경 밝기 기준 */
  settingColor?: THREE.ColorRepresentation
  /**
   * 6밴드 가중치를 채널마다 합 1로 맞춘다. Jewel_test 원본 가중치는 빨강 합이 1.08이라 흰 빛이 8% 붉게(분홍) 나온다 —
   * ACES는 채도를 눌러 잘 안 보이지만 Neutral 톤매핑에선 센터석이 복숭아빛으로 보였다. 기본 false = 원본 그대로
   */
  neutralSpectrum?: boolean
}

/**
 * three-mesh-bvh 기반 GPU 레이트레이싱 보석 재질 (Jewel_test DiamondMaterial 이식).
 * 내부 충돌마다 Fresnel로 투과/반사 에너지를 나눠 누적하고, 겉면 반사는 환경맵을 실제로 샘플한다.
 * 출력은 톤매핑 전 선형 HDR — 톤매핑은 후처리(ToneMapping 이펙트)가 담당. 화면에 직접 그릴 때만
 * colorspace_fragment가 sRGB로 인코딩한다 (렌더 타깃에서는 항등).
 * geometry는 이 재질을 쓰는 메시의 geometry와 같아야 한다 (BVH가 그 로컬 공간에서 추적).
 */
export class DiamondMaterial extends THREE.ShaderMaterial {
  private readonly bvhUniform: MeshBVHUniformStruct
  /** 요청된 가림 정도 — 맵이 없으면(컷 미리보기 등) 빈 텍스처가 전부 '막힘'으로 읽히므로 uniform은 0으로 둔다 */
  private settingStrength = 0

  constructor(geometry: THREE.BufferGeometry, options: DiamondMaterialOptions = {}) {
    const bvhUniform = new MeshBVHUniformStruct()
    bvhUniform.updateFrom(new MeshBVH(geometry, { strategy: SAH, maxLeafTris: 1 }))
    // 자기 교차 회피 오프셋 — Jewel_test(반지름≈1 모델)의 0.0008을 스톤 크기에 비례시켜 단위(mm/m)와 무관하게
    geometry.computeBoundingSphere()
    const rayEpsilon = geometry.boundingSphere!.radius * 0.0008

    super({
      toneMapped: false,
      uniforms: {
        bvh: { value: bvhUniform },
        rayEpsilon: { value: rayEpsilon },
        envMap: { value: null },
        envRotation: { value: new THREE.Matrix3() },
        envMapIntensity: { value: 1.4 },
        envBlur: { value: 0 },
        ior: { value: 2.417 },
        bounces: { value: 5 },
        aberrationStrength: { value: 0.024 },
        dispersionMode: { value: 2 },
        color: { value: new THREE.Color(0xffffff) },
        absorptionFactor: { value: 0.08 },
        fresnelBias: { value: 0.04 },
        sparkleIntensity: { value: 0.45 },
        pixelSamples: { value: 1 },
        settingOcclusion: { value: null },
        settingStrength: { value: 0 },
        settingColor: { value: new THREE.Color(0x000000) },
        neutralSpectrum: { value: false },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        varying vec3 vLocalNormal;
        varying vec3 vLocalCameraPosition;

        void main() {
          vLocalPosition = position;
          vLocalNormal = normalize(normal);
          vLocalCameraPosition = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        // 보석 메시는 삼각형이 적어 깊이 24면 충분 — 모바일 GPU 레지스터 스필 방지
        #define BVH_STACK_DEPTH 24

        precision highp float;
        precision highp int;
        precision highp isampler2D;
        precision highp usampler2D;
        precision highp sampler2D;

        ${shaderStructs}
        ${shaderIntersectFunction}

        uniform BVH bvh;
        uniform float rayEpsilon;
        uniform samplerCube envMap;
        uniform mat3 envRotation;
        uniform float envMapIntensity;
        uniform float envBlur;
        uniform float ior;
        uniform int bounces;
        uniform float aberrationStrength;
        uniform int dispersionMode;
        uniform vec3 color;
        uniform float absorptionFactor;
        uniform float fresnelBias;
        uniform float sparkleIntensity;
        uniform int pixelSamples;
        uniform sampler2D settingOcclusion;
        uniform float settingStrength;
        uniform vec3 settingColor;
        uniform bool neutralSpectrum;
        uniform mat4 modelMatrix;

        varying vec3 vLocalPosition;
        varying vec3 vLocalNormal;
        varying vec3 vLocalCameraPosition;

        vec3 sampleEnv(vec3 worldDir) {
          vec3 envColor = textureLod(envMap, envRotation * normalize(worldDir), envBlur).rgb * envMapIntensity;
          // 아주 밝은 핀라이트(좁은 스펙큘러 피크)만 추가로 끌어올림
          float luma = dot(envColor, vec3(0.2126, 0.7152, 0.0722));
          float highlight = max(0.0, luma - 3.2);
          return envColor + envColor * highlight * 0.15 * sparkleIntensity;
        }

        // 팔면체 매핑 — settingOcclusion.ts octDecode의 역. 0 부호는 +로 (CPU 쪽 텍셀 중심은 0이 안 나옴)
        vec2 octEncode(vec3 d) {
          d /= abs(d.x) + abs(d.y) + abs(d.z);
          vec2 p = d.z >= 0.0 ? d.xy : (1.0 - abs(d.yx)) * (step(0.0, d.xy) * 2.0 - 1.0);
          return p * 0.5 + 0.5;
        }

        // 로컬 방향으로 스톤을 빠져나간 빛 — 금속 받침에 막힌 방향이면 환경 대신 받침 속 색
        vec3 exitLight(vec3 localDir, vec3 envColor) {
          if (settingStrength <= 0.0) return envColor;
          float open = textureLod(settingOcclusion, octEncode(normalize(localDir)), 0.0).r;
          return mix(envColor, settingColor, settingStrength * (1.0 - open));
        }

        // 모드 0: 탈출 방향만 RGB로 벌려 샘플
        vec3 sampleEnvChromatic(vec3 worldDir, vec3 worldNormal, float strength) {
          if (strength < 0.0005) return sampleEnv(worldDir);
          vec3 offset = cross(worldDir, worldNormal) * (strength * 2.2);
          float r = sampleEnv(worldDir - offset).r;
          float g = sampleEnv(worldDir).g;
          float b = sampleEnv(worldDir + offset).b;
          return vec3(r, g, b);
        }

        float fresnelSchlick(float cosTheta, float f0) {
          return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
        }

        float fresnelDielectric(float cosThetaI, float etaI, float etaT) {
          cosThetaI = clamp(cosThetaI, -1.0, 1.0);
          float sinThetaI = sqrt(max(0.0, 1.0 - cosThetaI * cosThetaI));
          float sinThetaT = (etaI / etaT) * sinThetaI;
          if (sinThetaT >= 1.0) return 1.0;
          float cosThetaT = sqrt(max(0.0, 1.0 - sinThetaT * sinThetaT));
          float rParl = ((etaT * cosThetaI) - (etaI * cosThetaT)) / ((etaT * cosThetaI) + (etaI * cosThetaT));
          float rPerp = ((etaI * cosThetaI) - (etaT * cosThetaT)) / ((etaI * cosThetaI) + (etaT * cosThetaT));
          return clamp((rParl * rParl + rPerp * rPerp) * 0.5, 0.0, 1.0);
        }

        // 한 파장(channelIOR)의 내부 광선을 로컬 BVH 안에서 추적 —
        // 충돌마다 투과분은 환경을 샘플해 누적, 반사분은 계속 추적
        vec3 traceInternalRay(vec3 startOriginLocal, vec3 initialDirLocal, float channelIOR, bool postChromatic, out float totalDistance) {
          vec3 rayOrigin = startOriginLocal;
          vec3 rayDir = normalize(initialDirLocal);
          totalDistance = 0.0;

          vec3 accumulatedExitLight = vec3(0.0);
          float remainingEnergy = 1.0;

          uvec4 faceIndices = uvec4(0u);
          vec3 faceNormal = vec3(0.0);
          vec3 barycoord = vec3(0.0);
          float side = 1.0;
          float dist = 0.0;

          for (int b = 0; b < 7; b++) {
            if (b >= bounces || remainingEnergy < 0.03) break;

            bool hit = bvhIntersectFirstHit(bvh, rayOrigin + rayDir * rayEpsilon, rayDir, faceIndices, faceNormal, barycoord, side, dist);

            if (!hit) {
              vec3 worldExitDir = normalize((modelMatrix * vec4(rayDir, 0.0)).xyz);
              accumulatedExitLight += remainingEnergy * exitLight(rayDir, sampleEnv(worldExitDir));
              remainingEnergy = 0.0;
              break;
            }

            totalDistance += dist;
            rayOrigin = rayOrigin + rayDir * (dist + rayEpsilon);

            // faceNormal은 광선 반대쪽을 향하도록 정렬돼 나온다
            vec3 inwardNormal = normalize(faceNormal);
            float cosThetaI = clamp(-dot(rayDir, inwardNormal), 0.0, 1.0);
            float reflCoeff = fresnelDielectric(cosThetaI, channelIOR, 1.0);

            vec3 refractedOutLocal = refract(rayDir, inwardNormal, channelIOR);

            if (dot(refractedOutLocal, refractedOutLocal) > 0.0001 && reflCoeff < 0.999) {
              float transmitWeight = remainingEnergy * (1.0 - reflCoeff);
              vec3 worldExitDir = normalize((modelMatrix * vec4(refractedOutLocal, 0.0)).xyz);
              if (postChromatic) {
                vec3 worldFacetNorm = normalize((modelMatrix * vec4(inwardNormal, 0.0)).xyz);
                accumulatedExitLight += transmitWeight * exitLight(refractedOutLocal, sampleEnvChromatic(worldExitDir, worldFacetNorm, aberrationStrength));
              } else {
                accumulatedExitLight += transmitWeight * exitLight(refractedOutLocal, sampleEnv(worldExitDir));
              }
              remainingEnergy *= reflCoeff;
            }

            rayDir = normalize(reflect(rayDir, inwardNormal));
          }

          if (remainingEnergy >= 0.03) {
            vec3 worldExitDir = normalize((modelMatrix * vec4(rayDir, 0.0)).xyz);
            accumulatedExitLight += remainingEnergy * exitLight(rayDir, sampleEnv(worldExitDir));
          }

          return accumulatedExitLight;
        }

        // 진입점 하나(로컬)의 최종 색 — 겉면 반사 + 내부 굴절. localNormal은 시선 반대쪽을 향한다
        vec3 shadeEntry(vec3 entryLocal, vec3 localViewDir, vec3 localNormal, mat3 normalToWorld) {
          // 1. 겉면(크라운) 반사
          vec3 worldViewDir = normalize(mat3(modelMatrix) * localViewDir);
          vec3 worldNormal = normalize(normalToWorld * localNormal);
          float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0) + fresnelBias;
          float cosTheta = clamp(-dot(worldViewDir, worldNormal), 0.0, 1.0);
          float surfaceFresnel = fresnelSchlick(cosTheta, clamp(f0, 0.0, 1.0));
          vec3 surfaceReflection = exitLight(reflect(localViewDir, localNormal), sampleEnv(reflect(worldViewDir, worldNormal)));

          // 2. 로컬 공간에서 내부 굴절 추적 — 분산 모드별 채널(1·3·6)을 한 루프로 돌려
          //    traceInternalRay 호출 지점을 하나로 둔다 (인라인 사본이 늘면 D3D 셰이더 컴파일이 수십 초로 늘어남)
          const vec3 spectralWeights[6] = vec3[6](
            vec3(0.50, 0.00, 0.00), // Red
            vec3(0.35, 0.18, 0.00), // Orange
            vec3(0.15, 0.35, 0.00), // Yellow-Green
            vec3(0.00, 0.35, 0.15), // Green-Cyan
            vec3(0.00, 0.12, 0.40), // Cyan-Blue
            vec3(0.08, 0.00, 0.45)  // Blue-Violet
          );
          // 모드 0: 광선 1개 + 탈출 시 RGB 오프셋 / 모드 1: R·G·B 각 채널만 취함 / 모드 2: 6밴드 가중합
          bool postChromatic = aberrationStrength <= 0.0005 || dispersionMode == 0;
          int channels = postChromatic ? 1 : (dispersionMode == 1 ? 3 : 6);

          vec3 refractedColor = vec3(0.0);
          float avgDistance = 0.0;
          for (int c = 0; c < 6; c++) {
            if (c >= channels) break;
            float t = channels == 1 ? 0.0 : (channels == 3 ? float(c) - 1.0 : (float(c) / 5.0) * 2.0 - 1.0);
            vec3 weight = channels == 1 ? vec3(1.0) : (channels == 3 ? vec3(c == 0, c == 1, c == 2) : spectralWeights[c]);
            float channelIOR = max(1.05, ior + t * aberrationStrength);
            vec3 initialRefractLocal = refract(localViewDir, localNormal, 1.0 / channelIOR);
            if (dot(initialRefractLocal, initialRefractLocal) < 0.0001) initialRefractLocal = reflect(localViewDir, localNormal);
            float dist = 0.0;
            // 6밴드 가중치 채널 합 = (1.08, 1.0, 1.0)
            if (neutralSpectrum && channels == 6) weight /= vec3(1.08, 1.0, 1.0);
            refractedColor += traceInternalRay(entryLocal, initialRefractLocal, channelIOR, postChromatic, dist) * weight;
            avgDistance += dist / float(channels);
          }

          // 3. Beer-Lambert 체적 흡수
          vec3 safeColor = max(color, vec3(0.02));
          vec3 absorptionCoeff = -log(safeColor) * absorptionFactor;
          refractedColor *= exp(-absorptionCoeff * avgDistance);

          // 4. 겉면 반사 + 내부 굴절 합성
          return mix(refractedColor, surfaceReflection, surfaceFresnel);
        }

        // 픽셀 안 회전 격자(rook) 4점 — 가로·세로 어느 줄에도 두 점이 겹치지 않게
        const vec2 pixelOffsets[4] = vec2[4](vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(0.125, 0.375), vec2(-0.375, 0.125));

        void main() {
          mat3 normalToWorld = transpose(inverse(mat3(modelMatrix)));
          vec3 localViewDir = normalize(vLocalPosition - vLocalCameraPosition);
          vec3 localNormal = normalize(vLocalNormal);
          if (dot(localViewDir, localNormal) > 0.0) localNormal = -localNormal;
          // 이 삼각형 평면 위에서 이웃 픽셀까지의 위치 변화 — 서브픽셀 광선 방향을 만든다
          vec3 dpdx = dFdx(vLocalPosition);
          vec3 dpdy = dFdy(vLocalPosition);

          // 샘플 1개면 래스터 진입점, 여러 개면 서브픽셀 광선을 카메라에서 다시 쏴 그 지점의 실제 진입 facet을 찾는다.
          // shadeEntry 호출 지점은 하나 (인라인 사본 최소화)
          int samples = max(pixelSamples, 1);
          uvec4 faceIndices = uvec4(0u);
          vec3 faceNormal = vec3(0.0);
          vec3 barycoord = vec3(0.0);
          float side = 1.0;
          float dist = 0.0;
          vec3 finalColor = vec3(0.0);
          for (int s = 0; s < 4; s++) {
            if (s >= samples) break;
            vec3 entry = vLocalPosition;
            vec3 dir = localViewDir;
            vec3 entryNormal = localNormal;
            if (samples > 1) {
              vec3 target = vLocalPosition + dpdx * pixelOffsets[s].x + dpdy * pixelOffsets[s].y;
              vec3 subDir = normalize(target - vLocalCameraPosition);
              // 서브픽셀이 스톤 밖(실루엣 가장자리)이면 래스터 진입점을 그대로 쓴다
              if (bvhIntersectFirstHit(bvh, vLocalCameraPosition, subDir, faceIndices, faceNormal, barycoord, side, dist)) {
                entry = vLocalCameraPosition + subDir * dist;
                dir = subDir;
                entryNormal = normalize(faceNormal);
              }
            }
            finalColor += shadeEntry(entry, dir, entryNormal, normalToWorld);
          }
          finalColor /= float(samples);

          // NaN/Inf 픽셀이 Bloom mip 체인을 오염시키면 화면 전체가 검게 깜빡인다
          // D3D(ANGLE) 컴파일러는 isnan을 최적화로 지울 수 있어 min/max 클램프로도 한 번 더 걸러낸다
          if (any(isnan(finalColor)) || any(isinf(finalColor))) finalColor = vec3(0.0);
          finalColor = clamp(finalColor, vec3(0.0), vec3(64.0));
          gl_FragColor = vec4(finalColor, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })

    this.bvhUniform = bvhUniform
    this.update(options)
  }

  update(options: DiamondMaterialOptions) {
    const u = this.uniforms
    if (options.envMap !== undefined) u.envMap.value = options.envMap
    if (options.envRotation !== undefined) u.envRotation.value.copy(options.envRotation)
    if (options.envMapIntensity !== undefined) u.envMapIntensity.value = options.envMapIntensity
    if (options.envBlur !== undefined) u.envBlur.value = options.envBlur
    if (options.ior !== undefined) u.ior.value = options.ior
    if (options.bounces !== undefined) u.bounces.value = options.bounces
    if (options.aberrationStrength !== undefined) u.aberrationStrength.value = options.aberrationStrength
    if (options.dispersionMode !== undefined) u.dispersionMode.value = options.dispersionMode
    if (options.color !== undefined) u.color.value.set(options.color)
    if (options.absorptionFactor !== undefined) u.absorptionFactor.value = options.absorptionFactor
    if (options.fresnelBias !== undefined) u.fresnelBias.value = options.fresnelBias
    if (options.sparkleIntensity !== undefined) u.sparkleIntensity.value = options.sparkleIntensity
    if (options.pixelSamples !== undefined) u.pixelSamples.value = options.pixelSamples
    if (options.settingOcclusion !== undefined) u.settingOcclusion.value = options.settingOcclusion
    if (options.settingStrength !== undefined) this.settingStrength = options.settingStrength
    u.settingStrength.value = u.settingOcclusion.value ? this.settingStrength : 0
    if (options.settingColor !== undefined) u.settingColor.value.set(options.settingColor)
    if (options.neutralSpectrum !== undefined) u.neutralSpectrum.value = options.neutralSpectrum
  }

  dispose() {
    this.bvhUniform.dispose()
    super.dispose()
  }
}
