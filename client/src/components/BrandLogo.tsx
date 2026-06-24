import { cn } from "@/lib/utils";

/** AF 마크 아이콘 (투명 배경, 정사각). */
export const ARBEN_LOGO_URL = "/af-mark.png";
/** 브랜드명 (영문). */
export const BRAND_NAME = "ARVEN FACTORY";

interface BrandLogoProps {
  /** 로고 마크 한 변의 크기(px). 기본 36 */
  size?: number;
  /** 브랜드명 텍스트 노출 여부. 기본 true */
  showText?: boolean;
  /** 텍스트 크기 클래스 (예: text-base, text-lg) */
  textClassName?: string;
  className?: string;
}

/**
 * ARVEN FACTORY 브랜드 로고.
 * AF 마크 이미지를 헤더/인증/관리자 화면에서 공통으로 사용한다.
 */
export default function BrandLogo({
  size = 36,
  showText = true,
  textClassName = "text-lg",
  className,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <img
          src={ARBEN_LOGO_URL}
          alt="ARVEN FACTORY 로고"
          className="h-full w-full object-contain"
          loading="eager"
        />
      </span>
      {showText && (
        <span
          className={cn(
            "font-bold uppercase tracking-[0.08em] text-foreground",
            textClassName
          )}
        >
          {BRAND_NAME}
        </span>
      )}
    </span>
  );
}
