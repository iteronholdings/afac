import { COMPANY } from "@/lib/company";
import { MessageCircle } from "lucide-react";

/**
 * 관리자(운영팀) 문의 = 카카오톡 채널로 일원화.
 * 사이트 내 운영팀 채팅 대신 이 버튼으로 카카오 채널 채팅을 새 탭에서 연다.
 */
export default function KakaoInquiryButton({
  size = "md",
  label = "관리자에게 문의하기",
  className = "",
}: {
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const sizeCls = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";
  return (
    <a
      href={COMPANY.kakaoChannel}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#FAE100] font-bold text-[#3B1E1E] transition-opacity hover:opacity-85 ${sizeCls} ${className}`}
    >
      <MessageCircle className="h-4 w-4 fill-[#3B1E1E]" />
      {label}
    </a>
  );
}
