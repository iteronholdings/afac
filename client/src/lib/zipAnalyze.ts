import JSZip from "jszip";

/**
 * 업로드 전에 브라우저에서 통합 ZIP을 열어 '몇 명분(리뷰어 단위)'으로 인식되는지 분석한다.
 * 서버 배정 로직(assignPacketsForCampaign의 analyzeZipUnits)과 동일한 규칙:
 *  - 내부 .zip 여러 개 → 각 zip = 1명
 *  - 아니면 사진이 든 '바로 위 폴더' 단위 = 1명 (래퍼/배치 폴더 몇 겹이든 무관)
 *  - 래퍼 zip 한 겹(단일 zip만)이면 그 안으로 재귀
 *  - 폴더 구분 없이 사진만 흩어져 있으면 1명분(분리 불가)
 */
export type ZipAnalysis = {
  /** 인식된 리뷰어 단위 수. */
  units: number;
  /** 단위 이름 목록 (최대 12개까지만). */
  names: string[];
  /** 총 파일(사진) 수. */
  files: number;
  /** 폴더 구분이 전혀 없어 통째 1명분이 되는 경우 true. */
  unstructured: boolean;
};

async function analyze(zip: JSZip, depth = 0): Promise<ZipAnalysis> {
  const entries: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((p, f) => { if (!f.dir) entries.push({ path: p, file: f }); });
  if (entries.length === 0) return { units: 0, names: [], files: 0, unstructured: false };

  const zipFiles = entries.filter(e => /\.zip$/i.test(e.path));
  const nonZip = entries.filter(e => !/\.zip$/i.test(e.path));

  // 래퍼 zip 한 겹 → 그 안으로 재귀.
  if (depth < 5 && zipFiles.length === 1 && nonZip.length === 0) {
    try {
      const inner = await JSZip.loadAsync(await zipFiles[0].file.async("uint8array"));
      const r = await analyze(inner, depth + 1);
      if (r.units > 0) return r;
    } catch { /* 못 열면 아래 규칙으로 */ }
  }

  const names: string[] = [];
  for (const z of zipFiles) names.push(z.path.split("/").pop() || "packet.zip");

  const parents = new Map<string, number>();
  for (const e of nonZip) {
    const slash = e.path.lastIndexOf("/");
    const parent = slash >= 0 ? e.path.slice(0, slash) : "";
    parents.set(parent, (parents.get(parent) || 0) + 1);
  }
  const parentNames = Array.from(parents.keys());
  for (const p of parentNames) names.push(p ? (p.split("/").pop() || p) : "사진모음");

  const units = zipFiles.length + parentNames.length;
  // 폴더 구분 없음 = zip 없고 사진 폴더(부모)가 1개뿐인데 파일이 여러 장.
  const unstructured = zipFiles.length === 0 && parentNames.length === 1 && nonZip.length > 1;

  names.sort((a, b) => a.localeCompare(b, "ko"));
  return { units, names: names.slice(0, 12), files: nonZip.length, unstructured };
}

/** 선택된 ZIP 파일을 로컬에서 분석 (업로드 전 즉시, 서버 왕복 없음). */
export async function analyzeZipFile(file: File | Blob): Promise<ZipAnalysis> {
  const zip = await JSZip.loadAsync(file);
  return analyze(zip);
}
