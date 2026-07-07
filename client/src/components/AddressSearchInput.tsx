import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { daum?: any }
}

/** 다음(카카오) 우편번호 서비스 스크립트 로드 — 무료, API 키 불필요. */
function loadPostcode(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) return resolve(window.daum);
    const s = document.createElement("script");
    s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = () => resolve(window.daum);
    s.onerror = () => reject(new Error("우편번호 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    document.head.appendChild(s);
  });
}

/**
 * 우편번호 검색 기반 주소 입력.
 * 기본주소는 검색으로만 채울 수 있어(직접 타이핑 불가) "금화로82번길14" 같은
 * 불완전 주소를 차단한다. 최종 값: "(우편번호) 도로명주소, 상세주소".
 */
export default function AddressSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [base, setBase] = useState(value); // "(우편번호) 도로명주소" — 검색으로만 설정
  const [detail, setDetail] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const touchedRef = useRef(false);

  // 프로필처럼 기존 주소가 비동기로 로드되는 경우, 사용자가 손대기 전까지만 반영.
  useEffect(() => {
    if (!touchedRef.current && value && !base && !detail) setBase(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (b: string, d: string) => onChange(d.trim() ? `${b}, ${d.trim()}` : b);

  useEffect(() => {
    if (!searchOpen || !boxRef.current) return;
    let cancelled = false;
    loadPostcode()
      .then(daum => {
        if (cancelled || !boxRef.current) return;
        boxRef.current.innerHTML = "";
        new daum.Postcode({
          oncomplete: (data: any) => {
            touchedRef.current = true;
            const road = data.roadAddress || data.address;
            const building = data.buildingName ? ` (${data.buildingName})` : "";
            const b = `(${data.zonecode}) ${road}${building}`;
            setBase(b);
            emit(b, detail);
            setSearchOpen(false);
          },
          width: "100%",
          height: "100%",
        }).embed(boxRef.current);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : "우편번호 서비스 오류"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          readOnly value={base}
          placeholder="우편번호 찾기로 주소를 검색하세요"
          onClick={() => { if (!base) setSearchOpen(true); }}
          className="h-11 flex-1 cursor-pointer bg-muted/40"
        />
        <Button type="button" variant="outline" className="h-11 shrink-0 bg-card font-semibold"
          onClick={() => setSearchOpen(o => !o)}>
          <Search className="mr-1.5 h-4 w-4" /> {base ? "다시 찾기" : "우편번호 찾기"}
        </Button>
      </div>

      {searchOpen && (
        <div ref={boxRef} className="h-96 w-full overflow-hidden rounded-xl border border-border bg-card" />
      )}

      <Input
        placeholder={base ? "상세주소 (동·호수 등)" : "먼저 우편번호 찾기로 주소를 검색해 주세요"}
        disabled={!base} maxLength={100}
        value={detail}
        onChange={e => { touchedRef.current = true; setDetail(e.target.value); emit(base, e.target.value); }}
        className="h-11"
      />
    </div>
  );
}
