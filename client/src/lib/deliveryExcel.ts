// xlsx 커뮤니티판은 셀 스타일(배경색) 미지원 — 동일 API에 스타일이 추가된 포크 사용.
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";

export type DeliveryRow = {
  name: string;
  productTitle: string;
  productPrice: number;
  phone: string;
  address: string;
};

/**
 * 배송용 참여 리뷰어 엑셀 다운로드 (관리자·업체 공용).
 * 1행 헤더(연한 노랑 배경·굵게) + A열 순번, 택배사(G)·운송장 번호(H)는 공란(업체 기입).
 */
export function downloadDeliveryExcel(campaignTitle: string, rows: DeliveryRow[]) {
  if (rows.length === 0) {
    toast.error("내보낼 참여자가 없습니다.");
    return;
  }
  const wsData: (string | number)[][] = [
    ["번호", "상품명", "리뷰어 성함", "상품 최종구매 금액", "연락처", "주소", "택배사", "운송장 번호"],
    ...rows.map((r, i) => [
      i + 1, // A열: 리뷰어 순번
      r.productTitle,
      r.name,
      r.productPrice, // 리뷰 수수료 제외, 상품 최종판매가만
      r.phone,
      r.address,
      "", // 택배사: 공란 (업체가 입력)
      "", // 운송장 번호: 공란 (업체가 입력)
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 42 }, { wch: 10 }, { wch: 16 }];
  // 헤더(1행): 연한 노란색 배경 + 굵게 + 가운데 정렬
  const headerStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FFF2CC" } },
    font: { bold: true },
    alignment: { horizontal: "center" },
  };
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    if (ws[`${col}1`]) ws[`${col}1`].s = headerStyle;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "참여리뷰어");
  const safeTitle = campaignTitle.replace(/[\\/:*?"<>|]/g, " ").trim() || "캠페인";
  XLSX.writeFile(wb, `${safeTitle}_참여리뷰어_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success("엑셀 파일이 다운로드됩니다.");
}
